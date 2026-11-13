/* Progressive enhancement: normal web behavior remains when installation is unavailable. */
(() => {
  const install = document.getElementById('installApp');
  const status = document.getElementById('connectionStatus');
  let installPrompt = null;
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

})();
