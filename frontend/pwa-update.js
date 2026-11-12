/* Keep this separate from the old cached pwa.js so existing clients see the dialog on their next online visit. */
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const dialog = document.getElementById('appUpdateDialog');
  const title = document.getElementById('appUpdateTitle');
  const description = document.getElementById('appUpdateDescription');
  const status = document.getElementById('appUpdateStatus');
  const button = document.getElementById('appUpdateConfirm');
  if (!dialog || !button) return;
  let waiting = null;
  let applying = false;
  let registration = null;
  const en = () => document.documentElement.lang === 'en';
  const tr = (vi, eng) => en() ? eng : vi;
  const render = () => {
    title.textContent = tr('KimKim có phiên bản mới', 'A new KimKim version is ready');
    description.textContent = tr('Cập nhật để tiếp tục sử dụng KimKim. Nội dung chưa lưu có thể bị mất khi tải lại.', 'Update to continue using KimKim. Unsaved work may be lost when the app reloads.');
    button.textContent = applying ? tr('Đang cập nhật…', 'Updating…') : tr('Cập nhật ngay', 'Update now');
  };
  function offer(worker) {
    if (!worker || !navigator.serviceWorker.controller) return;
    waiting = worker;
    render();
    if (!dialog.open) dialog.showModal();
  }
  dialog.addEventListener('cancel', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (!waiting || applying) return;
    applying = true;
    button.disabled = true;
    status.textContent = tr('Đang tải bản mới…', 'Loading the new version…');
    render();
    waiting.postMessage({type:'SKIP_WAITING'});
    // If activation stalls, allow a retry without closing the update dialog.
    setTimeout(() => {
      if (!applying) return;
      applying = false;
      button.disabled = false;
      status.textContent = tr('Chưa thể cập nhật. Vui lòng thử lại.', 'Update could not finish. Please try again.');
      render();
    }, 15000);
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying || dialog.open) window.location.reload();
  });
  document.addEventListener('akk:languagechange', render);
  async function check() {
    if (!registration) return;
    if (registration.waiting) offer(registration.waiting);
    if (!navigator.onLine) return;
    try {
      await registration.update();
      if (registration.waiting) offer(registration.waiting);
    } catch {
      if (dialog.open) status.textContent = tr('Không thể kiểm tra bản cập nhật. Vui lòng kết nối mạng và thử lại.', 'Could not check for updates. Reconnect and try again.');
    }
  }
  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('./sw.js', {scope:'./',updateViaCache:'none'});
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offer(registration.waiting || worker);
        });
      });
      await check();
      document.addEventListener('visibilitychange', () => {if (!document.hidden) check();});
      window.addEventListener('online', check);
      setInterval(() => {if (!document.hidden) check();}, 5 * 60 * 1000);
    } catch (error) {console.warn('PWA update check unavailable:', error);}
  });
})();
