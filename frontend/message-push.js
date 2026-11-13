/* Opt-in web push for private messages. Tokens are scoped to the signed-in user. */
(() => {
  'use strict';
  const FC = window.FirebaseClient;
  const key = 'kimkim-message-push-device';
  const soundKey = () => 'kimkim-message-sound:' + (firebase.auth().currentUser?.uid || 'guest');
  let currentUid = null;
  let currentId = null;
  let currentToken = null;
  let audio;
  const tr = (vi, en) => document.documentElement.lang === 'en' ? en : vi;
  const supported = () => !!(window.isSecureContext && window.Notification && navigator.serviceWorker && window.PushManager && window.firebase?.messaging?.isSupported?.());
  const soundEnabled = () => localStorage.getItem(soundKey()) !== 'off';
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
      if (soundEnabled()) sound();
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
  function renderSettings() {
    const tab = document.querySelector('.settings-tabs [data-s="notifications"]');
    const pane = document.getElementById('settingsNotifications');
    if (!tab || !pane) return;
    tab.textContent = tr('Thông báo', 'Notifications');
    const permitted = supported() && Notification.permission === 'granted';
    const enabled = permitted && !!localStorage.getItem(key);
    const status = !supported() ? tr('Thiết bị hoặc trình duyệt này chưa hỗ trợ push.', 'Push is not supported on this device or browser.')
      : Notification.permission === 'denied' ? tr('Trình duyệt đang chặn thông báo. Hãy cấp quyền trong cài đặt trình duyệt.', 'Notifications are blocked. Allow them in browser settings.')
      : enabled ? tr('Thiết bị này đã đăng ký nhận thông báo.', 'This device is registered for notifications.')
      : tr('Bật để nhận thông báo khi KimKim không ở trên màn hình.', 'Enable to receive messages when KimKim is not on screen.');
    pane.innerHTML = `<div class="message-settings-head"><span class="message-settings-icon" aria-hidden="true">♪</span><div><h3>${tr('Thông báo tin nhắn', 'Message notifications')}</h3><p>${tr('Chọn cách KimKim báo cho bạn trên thiết bị này.', 'Choose how KimKim alerts you on this device.')}</p></div></div>
      <div class="message-settings-row"><div><strong>${tr('Thông báo đẩy', 'Push notifications')}</strong><p>${tr('Hiện thông báo khi có tin nhắn mới, kể cả khi đóng app.', 'Show new messages even when the app is closed.')}</p></div><button type="button" class="message-settings-switch ${enabled?'on':''}" role="switch" aria-checked="${enabled}" id="messagePushSwitch" ${!supported()?'disabled':''} aria-label="${tr('Thông báo đẩy', 'Push notifications')}"><i></i></button></div>
      <p class="message-settings-status" id="messagePushStatus" role="status">${status}</p>
      <div class="message-settings-row"><div><strong>${tr('Âm thanh trong app', 'In-app sound')}</strong><p>${tr('Phát tiếng chuông khi tab KimKim vẫn đang chạy. Không ảnh hưởng tiếng thông báo hệ thống.', 'Play a chime while the KimKim tab is running. System notification sounds are separate.')}</p></div><button type="button" class="message-settings-switch ${soundEnabled()?'on':''}" role="switch" aria-checked="${soundEnabled()}" id="messageSoundSwitch" aria-label="${tr('Âm thanh trong app', 'In-app sound')}"><i></i></button></div>
      <button type="button" class="btn btn-ghost message-sound-preview" id="messageSoundPreview">${tr('Nghe thử tiếng chuông', 'Preview chime')}</button>`;
    pane.querySelector('#messagePushSwitch').addEventListener('click', async event => {
      const button = event.currentTarget, label = pane.querySelector('#messagePushStatus');
      button.disabled = true; label.textContent = tr('Đang cập nhật…', 'Updating…');
      try { if (enabled) await disable(); else await enable(); renderSettings(); }
      catch (error) { label.textContent = error.message || tr('Không thể cập nhật thông báo.', 'Could not update notifications.'); button.disabled = false; }
    });
    pane.querySelector('#messageSoundSwitch').addEventListener('click', () => {
      localStorage.setItem(soundKey(), soundEnabled() ? 'off' : 'on');
      renderSettings();
    });
    pane.querySelector('#messageSoundPreview').addEventListener('click', sound);
  }
  function mountSettings() {
    const tabs = document.querySelector('.settings-tabs'), password = tabs?.querySelector('[data-s="password"]');
    const wrap = document.querySelector('.settings-wrap');
    if (!tabs || !wrap || tabs.querySelector('[data-s="notifications"]')) return;
    const tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'nav-item'; tab.dataset.s = 'notifications';
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false'); tab.setAttribute('aria-controls', 'settingsNotifications');
    tab.onclick = () => window.showSettings('notifications', tab);
    password?.before(tab);
    const pane = document.createElement('div');
    pane.id = 'settingsNotifications'; pane.className = 'card settings-pane hidden message-settings-pane'; pane.setAttribute('role', 'tabpanel');
    document.getElementById('settingsPassword')?.before(pane);
    renderSettings();
    document.addEventListener('akk:languagechange', renderSettings);
    document.addEventListener('akk:viewchange', event => { if (event.detail?.view === 'settings') renderSettings(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSettings); else mountSettings();
  window.KimKimMessagePush = {supported,enable,disable,foreground,restore,renderSettings,soundEnabled};
})();
