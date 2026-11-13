/* Opt-in web push for private messages. Tokens are scoped to the signed-in user. */
(() => {
  'use strict';
  const FC = window.FirebaseClient;
  const key = 'kimkim-message-push-device';
  let currentUid = null;
  let currentId = null;
  let currentToken = null;
  let audio;
  const tr = (vi, en) => document.documentElement.lang === 'en' ? en : vi;
  const supported = () => !!(window.isSecureContext && window.Notification && navigator.serviceWorker && window.PushManager && window.firebase?.messaging?.isSupported?.());
  function sound() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const start = audio.currentTime;
      for (const [index, frequency] of [660, 880].entries()) {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start + index * .14);
        gain.gain.exponentialRampToValueAtTime(.065, start + index * .14 + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + index * .14 + .19);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start + index * .14); oscillator.stop(start + index * .14 + .2);
      }
    } catch { /* OS notification sound is still available. */ }
  }
  const tokenRef = (uid, id) => FC.db.collection('communityPushTokens').doc(uid).collection('devices').doc(id);
  async function enable() {
    if (!supported()) throw Error(tr('Thiết bị hoặc trình duyệt này chưa hỗ trợ thông báo đẩy.', 'Push notifications are not supported on this device or browser.'));
    const user = firebase.auth().currentUser;
    if (!user) throw Error(tr('Vui lòng đăng nhập trước.', 'Please sign in first.'));
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw Error(tr('Hãy cho phép thông báo trong cài đặt trình duyệt.', 'Allow notifications in your browser settings.'));
    const config = await FC.db.collection('communityConfig').doc('push').get();
    const vapidKey = config.data()?.vapidKey;
    if (!vapidKey || typeof vapidKey !== 'string') throw Error(tr('Thông báo đẩy chưa được cấu hình.', 'Push notifications are not configured yet.'));
    const registration = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({vapidKey, serviceWorkerRegistration:registration});
    if (!token) throw Error(tr('Không đăng ký được thiết bị. Hãy thử lại.', 'Could not register this device. Please retry.'));
    if (firebase.auth().currentUser?.uid !== user.uid) throw Error(tr('Phiên đăng nhập đã thay đổi.', 'Your sign-in session changed.'));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const ref = tokenRef(user.uid, id), existing = await ref.get();
    await ref.set({token, createdAt:existing.exists ? existing.data().createdAt : FC.serverTimestamp(), updatedAt:FC.serverTimestamp()});
    currentUid = user.uid; currentId = id; currentToken = token;
    localStorage.setItem(key, JSON.stringify({uid:user.uid,id}));
    // The click that enabled notifications also unlocks the in-app chime.
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); } catch {}
    return true;
  }
  async function disable() {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    const uid = currentUid || stored?.uid, id = currentId || stored?.id;
    try {
      if (uid && id && firebase.auth().currentUser?.uid === uid) await tokenRef(uid, id).delete();
    } finally {
      if (supported()) await firebase.messaging().deleteToken().catch(() => {});
      currentUid = currentId = currentToken = null;
      localStorage.removeItem(key);
    }
  }
  async function foreground({threadId, messageId, name}) {
    if (!messageId) return;
    const stamp = 'kimkim-push-' + messageId;
    try {
      if (localStorage.getItem(stamp)) return;
      localStorage.setItem(stamp, String(Date.now()));
      setTimeout(() => localStorage.removeItem(stamp), 20000);
    } catch {}
    if (Notification.permission === 'granted') {
      sound();
      if (document.visibilityState === 'visible' && !document.hasFocus()) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(name || 'KimKim', {body:tr('Bạn có tin nhắn mới.', 'You have a new message.'),icon:'assets/icons/icon-192.png',tag:'kimkim-message-'+messageId,data:{url:'./#messages/'+encodeURIComponent(threadId)},silent:false});
        } catch {}
      }
    }
  }
  function restore(user) {
    if (!user || !supported() || Notification.permission !== 'granted') return;
    try { if (JSON.parse(localStorage.getItem(key) || 'null')?.uid === user.uid) enable().catch(() => {}); } catch {}
  }
  window.KimKimMessagePush = {supported,enable,disable,foreground,restore};
})();
