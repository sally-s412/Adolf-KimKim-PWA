/* Per-device message alerts. Browser permission is requested only from a user gesture. */
(() => {
  'use strict';
  const FC = window.FirebaseClient;
  const key = 'kimkim-message-push-device';
  const soundKey = () => 'kimkim-message-sound:' + (firebase.auth().currentUser?.uid || 'guest');
  const toneKey = () => 'kimkim-message-tone:' + (firebase.auth().currentUser?.uid || 'guest');
  const preferenceKey = uid => 'kimkim-message-push-preference:' + uid;
  const promptKey = uid => 'kimkim-message-push-prompt:' + uid;
  let currentUid = null;
  let currentId = null;
  let currentToken = null;
  let chime;
  let voice;
  const baseTitle = document.title;
  const favicon = document.querySelector('link[rel="icon"][sizes="32x32"]');
  const originalFavicon = favicon?.getAttribute('href');
  const tr = (vi, en) => document.documentElement.lang === 'en' ? en : vi;
  const supported = () => !!(window.isSecureContext && window.Notification && navigator.serviceWorker && window.PushManager && window.firebase?.messaging?.isSupported?.());
  const soundEnabled = () => localStorage.getItem(soundKey()) !== 'off';
  const tone = () => ['voice','chime','double'].includes(localStorage.getItem(toneKey())) ? localStorage.getItem(toneKey()) : 'voice';
  async function doubleTone() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return soundChime();
    const context = new AudioContext();
    await context.resume();
    for (const [frequency, at] of [[660,0],[880,.15]]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, context.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(.18, context.currentTime + at + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + at + .2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + at); oscillator.stop(context.currentTime + at + .21);
    }
    setTimeout(() => context.close().catch(() => {}), 700);
  }
  async function soundChime() {
    chime ||= new Audio(new URL('assets/sounds/kimkim-chime.wav', location.href).href);
    chime.pause(); chime.currentTime = 0; chime.volume = 1;
    await chime.play();
  }
  async function sound() {
    if (tone() === 'chime') return soundChime();
    if (tone() === 'double') return doubleTone();
    voice ||= new Audio(new URL('assets/sounds/kimkim-voice.wav', location.href).href);
    voice.pause(); voice.currentTime = 0; voice.volume = 1;
    return voice.play();
  }
  function setUnread(count) {
    count = Math.max(0, Number(count) || 0);
    document.title = count ? `(${count > 99 ? '99+' : count}) ${baseTitle}` : baseTitle;
    if (favicon && originalFavicon) {
      if (!count) favicon.href = originalFavicon;
      else {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const icon = new Image();
          icon.onload = () => {
            if (!document.title.startsWith('(')) return;
            ctx.drawImage(icon, 0, 0, 32, 32);
            ctx.fillStyle = '#ec7298'; ctx.beginPath(); ctx.arc(25, 8, 7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#111a3d'; ctx.lineWidth = 2; ctx.stroke();
            favicon.href = canvas.toDataURL('image/png');
          };
          icon.src = new URL(originalFavicon, location.href).href;
        }
      }
    }
    if (navigator.setAppBadge && count) navigator.setAppBadge(count).catch(() => {});
    else if (navigator.clearAppBadge && !count) navigator.clearAppBadge().catch(() => {});
    navigator.serviceWorker?.controller?.postMessage({type:'KIMKIM_UNREAD_COUNT',count});
  }
  const tokenRef = (uid, id) => FC.db.collection('communityPushTokens').doc(uid).collection('devices').doc(id);
  async function enable() {
    if (!supported()) throw Error(tr('Thiết bị hoặc trình duyệt này chưa hỗ trợ thông báo đẩy.', 'Push notifications are not supported on this device or browser.'));
    const user = firebase.auth().currentUser;
    if (!user) throw Error(tr('Vui lòng đăng nhập trước.', 'Please sign in first.'));
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
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
    localStorage.setItem(preferenceKey(user.uid), 'on');
    document.getElementById('messagePushPrompt')?.remove();
    return true;
  }
  async function disable() {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    const uid = currentUid || stored?.uid, id = currentId || stored?.id;
    if (firebase.auth().currentUser?.uid) localStorage.setItem(preferenceKey(firebase.auth().currentUser.uid), 'off');
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
    if (soundEnabled()) sound().catch(() => {});
    if (window.Notification && Notification.permission === 'granted') {
      if (document.visibilityState === 'visible' && !document.hasFocus()) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(name || 'KimKim', {body:tr('Bạn có tin nhắn mới.', 'You have a new message.'),icon:'assets/icons/icon-192.png',tag:'kimkim-message-'+messageId,data:{url:'./#messages/'+encodeURIComponent(threadId)},silent:false});
        } catch {}
      }
    }
  }
  function showPermissionPrompt(user) {
    if (document.getElementById('messagePushPrompt') || localStorage.getItem(promptKey(user.uid))) return;
    localStorage.setItem(promptKey(user.uid), 'shown');
    const dialog = document.createElement('div');
    dialog.id = 'messagePushPrompt'; dialog.className = 'message-push-prompt';
    dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-label',tr('Bật thông báo KimKim','Enable KimKim notifications'));
    dialog.innerHTML = `<div class="message-push-prompt-card"><span aria-hidden="true" class="message-push-prompt-icon">✉</span><div><strong>${tr('Để KimKim báo bạn khi có tin nhắn mới', 'Let KimKim tell you about new messages')}</strong><p>${tr('Bật thông báo trên thiết bị này. Bạn có thể tắt bất cứ lúc nào trong Cài đặt.', 'Turn on alerts for this device. You can turn them off anytime in Settings.')}</p><div class="message-push-prompt-actions"><button type="button" class="btn btn-primary" data-action="enable">${tr('Bật thông báo', 'Enable notifications')}</button><button type="button" class="btn btn-ghost" data-action="later">${tr('Để sau', 'Later')}</button></div><p class="message-push-prompt-error" role="status"></p></div></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-action="later"]').onclick = () => dialog.remove();
    dialog.querySelector('[data-action="enable"]').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try { await enable(); renderSettings(); } catch (error) { dialog.querySelector('.message-push-prompt-error').textContent = error.message; button.disabled = false; }
    };
  }
  function restore(user) {
    document.getElementById('messagePushPrompt')?.remove();
    if (!user || !supported() || localStorage.getItem(preferenceKey(user.uid)) === 'off') return;
    if (Notification.permission === 'granted') enable().then(renderSettings).catch(() => {});
    else if (Notification.permission === 'default') setTimeout(() => {
      if (firebase.auth().currentUser?.uid === user.uid) showPermissionPrompt(user);
    }, 1200);
  }
  function renderSettings() {
    const tab = document.querySelector('.settings-tabs [data-s="notifications"]');
    const pane = document.getElementById('settingsNotifications');
    if (!tab || !pane) return;
    tab.textContent = tr('Thông báo', 'Notifications');
    const permitted = supported() && Notification.permission === 'granted';
    const enabled = permitted && localStorage.getItem(preferenceKey(firebase.auth().currentUser?.uid)) !== 'off' && !!localStorage.getItem(key);
    const status = !supported() ? tr('Thiết bị hoặc trình duyệt này chưa hỗ trợ push.', 'Push is not supported on this device or browser.')
      : Notification.permission === 'denied' ? tr('Trình duyệt đang chặn thông báo. Hãy cấp quyền trong cài đặt trình duyệt.', 'Notifications are blocked. Allow them in browser settings.')
      : enabled ? tr('Thiết bị này đã đăng ký nhận thông báo.', 'This device is registered for notifications.')
      : tr('Bật để nhận thông báo khi KimKim không ở trên màn hình.', 'Enable to receive messages when KimKim is not on screen.');
    pane.innerHTML = `<div class="message-settings-head"><span class="message-settings-icon" aria-hidden="true">♪</span><div><h3>${tr('Thông báo tin nhắn', 'Message notifications')}</h3><p>${tr('Chọn cách KimKim báo cho bạn trên thiết bị này.', 'Choose how KimKim alerts you on this device.')}</p></div></div>
      <div class="message-settings-row"><div><strong>${tr('Thông báo đẩy', 'Push notifications')}</strong><p>${tr('Hiện thông báo khi có tin nhắn mới, kể cả khi đóng app.', 'Show new messages even when the app is closed.')}</p></div><button type="button" class="message-settings-switch ${enabled?'on':''}" role="switch" aria-checked="${enabled}" id="messagePushSwitch" ${!supported()?'disabled':''} aria-label="${tr('Thông báo đẩy', 'Push notifications')}"><i></i></button></div>
      <p class="message-settings-status" id="messagePushStatus" role="status">${status}</p>
      <div class="message-settings-row"><div><strong>${tr('Âm thanh trong app', 'In-app sound')}</strong><p>${tr('Phát âm thanh khi tab KimKim đang chạy. Tiếng thông báo hệ thống do thiết bị quản lý.', 'Play sound while the KimKim tab is running. The device controls system notification sounds.')}</p></div><button type="button" class="message-settings-switch ${soundEnabled()?'on':''}" role="switch" aria-checked="${soundEnabled()}" id="messageSoundSwitch" aria-label="${tr('Âm thanh trong app', 'In-app sound')}"><i></i></button></div>
      <fieldset class="message-tone-options"><legend>${tr('Chọn âm báo', 'Choose alert sound')}</legend>${[['voice',tr('KimKim gọi bạn', 'KimKim voice'),tr('Âm báo KimKim tươi vui', 'A playful KimKim alert')],['chime',tr('Chuông dịu', 'Soft chime'),tr('Tiếng chuông nhẹ nhàng', 'A gentle chime')],['double',tr('Hai nốt vui', 'Two bright notes'),tr('Âm báo ngắn, tươi vui', 'Short bright tones')]].map(([value,label,help])=>`<label class="message-tone-choice"><input type="radio" name="messageTone" value="${value}" ${tone()===value?'checked':''}><span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</fieldset>
      <button type="button" class="btn btn-ghost message-sound-preview" id="messageSoundPreview">${tr('Nghe thử âm báo', 'Preview sound')}</button><p class="message-sound-feedback" id="messageSoundFeedback" role="status" aria-live="polite"></p>`;
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
    pane.querySelectorAll('input[name="messageTone"]').forEach(input => input.addEventListener('change', () => {
      localStorage.setItem(toneKey(), input.value);
      sound().catch(() => {});
    }));
    pane.querySelector('#messageSoundPreview').addEventListener('click', async () => {
      const feedback = pane.querySelector('#messageSoundFeedback');
      try {
        await sound();
        feedback.textContent = tr('Đã phát âm báo. Nếu vẫn không nghe thấy, kiểm tra tab có bị tắt tiếng và âm lượng đầu ra của thiết bị.', 'Sound played. If you still hear nothing, check whether this tab is muted and your device output volume.');
      } catch (error) {
        feedback.textContent = error?.name === 'NotAllowedError'
          ? tr('Chrome đang chặn phát âm thanh trên trang này. Hãy tương tác với trang rồi thử lại.', 'Chrome blocked audio on this page. Interact with the page and try again.')
          : tr('Không tải hoặc phát được tiếng chuông. Hãy tải lại trang rồi thử lại.', 'The chime could not load or play. Reload the page and try again.');
      }
    });
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
  navigator.serviceWorker?.addEventListener?.('message', event => {
    if (event.data?.type === 'kimkim-message' && firebase.auth().currentUser) foreground(event.data);
  });
  window.KimKimMessagePush = {supported,enable,disable,foreground,restore,renderSettings,soundEnabled,setUnread};
})();
