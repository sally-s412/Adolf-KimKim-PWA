/* UI feedback only. No provider settings, prompts or AI payloads. */
function notify(message) {
  let region=document.getElementById('toastRegion');
  if(!region){region=document.createElement('div');region.id='toastRegion';region.className='toast-region';region.setAttribute('aria-live','polite');document.body.append(region);}
  const toast=document.createElement('div');toast.className='toast';
  const text=document.createElement('span');text.textContent=String(message);
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label',typeof t==='function'?t('uiCloseMessage'):'Dismiss');dismiss.onclick=()=>toast.remove();
  toast.append(text,dismiss);region.append(toast);
  while(region.children.length>3) region.firstElementChild.remove();
  setTimeout(()=>toast.remove(),6500);
}
function confirmAction(message,options={}){
  const dialog=document.getElementById('confirmDialog');
  if(dialog.open) return Promise.resolve(false);
  const previous=document.activeElement;
  document.getElementById('confirmHeading').textContent=t('uiConfirmTitle');
  document.getElementById('confirmMessage').textContent=String(message);
  document.getElementById('confirmCancel').textContent=t('cancelBtn');
  document.getElementById('confirmAccept').textContent=t('uiConfirmAction');
  document.getElementById('confirmAccept').className=options.destructive===false?'btn btn-primary':'btn btn-danger';
  dialog.returnValue='cancel';
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='confirm');if(previous?.isConnected) previous.focus();},{once:true});
    dialog.showModal();document.getElementById('confirmCancel').focus();
  });
}
