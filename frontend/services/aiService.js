/* ============================================================
   aiService.js

   NO real AI backend exists yet. This file intentionally contains
   NO logic that fabricates an intelligent-looking answer. It only
   persists the conversation and returns a fixed placeholder so the
   UI has real, wireable behavior once an AI engineer implements
   the backend (e.g. POST /ai/chat, POST /ai/meetings/:id/chat).

   Contract:
     watchChatHistory(cb) -> unsubscribe()
     sendChat(text) -> Promise<{ role:'agent', text: string }>
     watchMeetingIntelligence(meetingId, cb) -> unsubscribe()
        (summary / keyPoints / actionItems for a meeting; placeholder
         'processing' state until a real AI pipeline writes results)
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;
  const PLACEHOLDER = 'AI integration coming soon.';

  function watchChatHistory(cb) {
    const col = FC.userCol('chatMessages');
    if (!col) { cb([]); return () => {}; }
    return col.orderBy('createdAt', 'asc').limit(100).onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => {
        console.warn('chat listener warning, falling back to basic get:', err);
        col.limit(100).get().then(snap => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          docs.sort((a, b) => {
            const ta = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAt.seconds || 0)) : 0;
            const tb = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAt.seconds || 0)) : 0;
            return ta - tb;
          });
          cb(docs);
        }).catch(e => {
          console.error('get fallback error:', e);
          cb([]);
        });
      }
    );
  }

  async function addChatMessage(role, text) {
    const col = FC.userCol('chatMessages');
    if (!col) return null;
    return await col.add({
      role: role || 'user',
      text: text || '',
      createdAt: FC.serverTimestamp()
    });
  }

  async function clearChatHistory() {
    const col = FC.userCol('chatMessages');
    if (!col) return;
    const snap = await col.get();
    if (snap.empty) return;
    const batch = FC.db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  async function sendChat(text) {
    await addChatMessage('user', text);
    await addChatMessage('agent', PLACEHOLDER);
    return { role: 'agent', text: PLACEHOLDER };
  }

  /* ---- Meeting-scoped chat (RAG over transcript/uploaded files) ---- */
  async function addMeetingChatMessage(meetingId, role, text) {
    const col = FC.userCol('meetings');
    if (!col || !meetingId) return null;
    const msgCol = col.doc(meetingId).collection('chatMessages');
    const message = {
      role: role || 'user',
      text: text || '',
      createdAt: FC.serverTimestamp()
    };
    try {
      return await msgCol.add(message);
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
      // Existing per-user meeting documents already hold chatHistory. Do not
      // broaden Firestore permissions just to duplicate the same conversation.
      return await col.doc(meetingId).update({
        chatHistory: global.firebase.firestore.FieldValue.arrayUnion({
          role: message.role, text: message.text
        })
      });
    }
  }

  async function sendMeetingChat(meetingId, text) {
    await addMeetingChatMessage(meetingId, 'user', text);
    await addMeetingChatMessage(meetingId, 'agent', PLACEHOLDER);
    return { role: 'agent', text: PLACEHOLDER };
  }

  function isPermissionDenied(err) {
    return err && (err.code === 'permission-denied' || err.code === 'firestore/permission-denied');
  }

  function watchMeetingChat(meetingId, cb, onError) {
    const col = FC.userCol('meetings');
    if (!col || !meetingId) { cb([]); return () => {}; }
    let closed = false;
    let fallbackUnsub = null;
    function failed(err) {
      if (closed) return;
      if (onError) onError(err);
      else console.warn('meeting chat history unavailable:', err.code || 'unknown');
    }
    const primaryUnsub = col.doc(meetingId).collection('chatMessages').orderBy('createdAt', 'asc').limit(100).onSnapshot(
      snap => { if (!closed) cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      err => {
        if (closed) return;
        if (!isPermissionDenied(err)) { failed(err); return; }
        fallbackUnsub = col.doc(meetingId).onSnapshot(
          snap => {
            if (closed) return;
            const data = snap.exists ? snap.data() : {};
            cb(Array.isArray(data.chatHistory) ? data.chatHistory : []);
          },
          failed
        );
      }
    );
    return () => {
      closed = true;
      primaryUnsub();
      if (fallbackUnsub) fallbackUnsub();
    };
  }

  /* ---- NotebookLM-style generation (slides / mindmap / illustration) ----
     No generation pipeline exists yet. These write a job record with
     status:'queued' so the UI has real, wireable behaviour (loading →
     result) the moment a Cloud Function/worker starts consuming the
     'generationJobs' subcollection. */
  async function requestGeneration(meetingId, kind) {
    const col = FC.userCol('meetings');
    if (!col) throw new Error('Chưa đăng nhập.');
    const ref = await col.doc(meetingId).collection('generationJobs').add({
      kind, status: 'queued', createdAt: FC.serverTimestamp()
    });
    return ref.id;
  }
  function watchGenerationJobs(meetingId, cb) {
    const col = FC.userCol('meetings');
    if (!col) { cb([]); return () => {}; }
    return col.doc(meetingId).collection('generationJobs').orderBy('createdAt', 'desc').onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('generation jobs listener', err)
    );
  }

  global.AiService = {
    watchChatHistory, sendChat, addChatMessage, clearChatHistory, PLACEHOLDER,
    sendMeetingChat, addMeetingChatMessage, watchMeetingChat,
    requestGeneration, watchGenerationJobs
  };
})(window);
