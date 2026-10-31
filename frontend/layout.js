/* Editable implementation of FINAL Figma shell; existing view IDs and handlers stay intact. */
(() => {
  const root=document.documentElement;
  try{root.dataset.theme=localStorage.getItem('akk_theme')==='light'?'light':'dark'}catch{root.dataset.theme='dark'}
  const app=document.getElementById('app'),old=document.querySelector('.topbar');
  const header=document.createElement('header');header.className='app-header';
  const brand=document.createElement('div');brand.className='app-brand';brand.textContent='🐶 ADOLF KIMKIM 🐶';header.append(brand);
  header.append(document.getElementById('globalSearch'));
  const spacer=document.createElement('div');spacer.className='header-space';header.append(spacer,old.querySelector('.lang-switch'));
  const theme=document.createElement('button');theme.className='theme-toggle';theme.type='button';theme.setAttribute('aria-label','Switch light / dark');
  const sync=()=>{document.querySelector('meta[name=theme-color]')?.setAttribute('content',root.dataset.theme==='light'?'#e7ebf7':'#23293f');theme.textContent=root.dataset.theme==='dark'?'☀':'☾';theme.setAttribute('aria-pressed',String(root.dataset.theme==='light'))};
  theme.onclick=()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('akk_theme',root.dataset.theme)}catch{}sync()};sync();header.append(theme);app.prepend(header);old.remove();
  const sidebar=document.querySelector('.sidebar');
  const oldBrand=sidebar.firstElementChild;if(oldBrand?.textContent.includes('ADOLF KIMKIM'))oldBrand.remove();
  const menu=document.createElement('button');menu.type='button';menu.className='mobile-menu-btn';menu.textContent='☰';menu.setAttribute('aria-label','Open navigation');menu.onclick=()=>toggleMobileMenu();header.prepend(menu);
  const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',meetings:'M4 5h16v16H4ZM8 2v6m8-6v6M4 11h16',notes:'M5 3h14v18H5Zm4 5h6m-6 4h6m-6 4h4',recording:'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0Zm-3 7v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8',uploads:'M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7',team:'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9v-2a6 6 0 0 1 12 0v2m2-17a4 4 0 0 1 0 8m2 3a5 5 0 0 1 4 5',plan:'m3 8 4-5h10l4 5-9 13Zm0 0h18M7 3l5 18 5-18',rules:'M5 3h14v18H5Zm4 5h6m-6 4h6m-6 4h4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',profile:'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM3 22a9 9 0 0 1 18 0'};
  for(const n of document.querySelectorAll('.sidebar .nav-item[data-view]')){const ic=n.querySelector('.ic');if(ic&&paths[n.dataset.view])ic.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[n.dataset.view]+'"/></svg>';}
  document.querySelector('.settings-tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs=[...document.querySelectorAll('.settings-tabs [role=tab]')];
    const index=tabs.indexOf(document.activeElement);if(index<0) return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].focus();tabs[next].click();
  });
  const syncNavigationLabels=()=>document.querySelectorAll('.sidebar .nav-item[data-view]').forEach(item=>{
    const label=item.querySelector('[data-i18n]')?.textContent||'';
    item.setAttribute('role','button');item.tabIndex=0;item.setAttribute('aria-label',label);item.title=label;
  });
  syncNavigationLabels();document.addEventListener('akk:languagechange',syncNavigationLabels);
  document.querySelector('.sidebar').addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('.nav-item[data-view]')){event.preventDefault();event.target.click();}
  });
  const syncSwitchLabels=()=>document.querySelectorAll('.toggle-row .switch').forEach(button=>button.setAttribute('aria-label',button.parentElement.querySelector('span')?.textContent||''));
  syncSwitchLabels();document.addEventListener('akk:languagechange',syncSwitchLabels);
  const close=document.createElement('button');close.className='theme-toggle';close.type='button';close.textContent='×';close.setAttribute('aria-label','Close chat');close.onclick=()=>toggleChat();document.querySelector('.chat-header2').append(close);
})();
