/* Progressive enhancement: normal web behavior remains when installation is unavailable. */
(() => {
  const install = document.getElementById('installApp');
  const update = document.getElementById('updateApp');
  const status = document.getElementById('connectionStatus');
  let installPrompt = null;
  let waitingWorker = null;
  let reloadForUpdate = false;
  const en = () => document.documentElement.lang === 'en';

  function refreshStatus() {
    status.hidden = navigator.onLine;
    status.textContent = en()
      ? 'You are offline. Sign-in, sync and AI require an internet connection.'
      : 'Bạn đang ngoại tuyến. Đăng nhập, đồng bộ và AI cần kết nối Internet.';
  }
  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);
  document.addEventListener('akk:languagechange', refreshStatus);
  refreshStatus();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = false;
  });
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    install.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    install.hidden = true;
  });

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './', updateViaCache: 'none',
      });
      const offerUpdate = worker => {
        waitingWorker = worker;
        update.hidden = false;
      };
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            offerUpdate(registration.waiting || worker);
          }
        });
      });
    } catch (error) {
      console.warn('PWA registration unavailable:', error);
    }
  });
  update.addEventListener('click', async () => {
    const message = en()
      ? 'Save your work and stop any recording before updating. Reload now?'
      : 'Hãy lưu công việc và dừng ghi âm trước khi cập nhật. Tải lại ngay?';
    if (!waitingWorker || !await confirmAction(message, {destructive:false})) return;
    reloadForUpdate = true;
    waitingWorker.postMessage({type: 'SKIP_WAITING'});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadForUpdate) window.location.reload();
  });
})();
