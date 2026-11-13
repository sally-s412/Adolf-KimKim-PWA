'use strict';
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {logger} = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.notifyPrivateMessage = onDocumentCreated({
  document: 'communityThreads/{threadId}/messages/{messageId}',
  region: 'asia-southeast1',
  retry: false,
}, async event => {
  const message = event.data?.data();
  const {threadId, messageId} = event.params;
  if (!message || message.clientMessageId !== messageId || !message.senderId) return;
  const threadSnap = await db.doc(`communityThreads/${threadId}`).get();
  if (!threadSnap.exists) return;
  const thread = threadSnap.data();
  if (!Array.isArray(thread.members) || !thread.members.includes(message.senderId) || thread.members.length > 4) return;
  const recipients = thread.members.filter(uid => uid !== message.senderId);
  const senderProfile = await db.doc(`communityProfiles/${message.senderId}`).get();
  const senderName = String(senderProfile.data()?.name || 'KimKim').slice(0, 80);
  await Promise.all(recipients.map(async uid => {
    const [blockFrom, blockTo, receipt, devices] = await Promise.all([
      db.doc(`communityBlocks/${uid}/targets/${message.senderId}`).get(),
      db.doc(`communityBlocks/${message.senderId}/targets/${uid}`).get(),
      db.doc(`communityThreads/${threadId}/receipts/${uid}`).get(),
      db.collection(`communityPushTokens/${uid}/devices`).limit(20).get(),
    ]);
    if (blockFrom.exists || blockTo.exists || devices.empty) return;
    const readAt = receipt.data()?.readAt, sentAt = message.createdAt;
    if (readAt?.toMillis && sentAt?.toMillis && readAt.toMillis() >= sentAt.toMillis()) return;
    const docs = devices.docs.filter(doc => typeof doc.data().token === 'string');
    if (!docs.length) return;
    const response = await admin.messaging().sendEachForMulticast({
      tokens: docs.map(doc => doc.data().token),
      data: {
        type: 'kimkim-message', threadId, messageId,
        title: senderName,
        body: 'Bạn có tin nhắn mới / You have a new message',
      },
      webpush: {headers: {Urgency: 'high'}},
    });
    await Promise.all(response.responses.map(async (result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        await docs[index].ref.delete().catch(error => logger.warn('Token cleanup failed', {code:error.code}));
      } else logger.warn('Push delivery failed', {code, threadId, uid});
    }));
  }));
});
