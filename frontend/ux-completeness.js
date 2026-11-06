/* Source-aligned beta presentation. No AI configuration or request changes. */
(() => {
 const en=()=>typeof lang!=='undefined'&&lang==='en';
 function update(){
  const plan=document.getElementById('view-plan');
  if(plan){let n=plan.querySelector('.beta-scope-notice');if(!n){n=document.createElement('p');n.className='beta-scope-notice';n.setAttribute('role','note');plan.querySelector('.view-sub').after(n);}n.textContent=en()?'Beta access is active. Paid plans are planned; payments are not available.':'Bạn đang trải nghiệm beta. Các gói trả phí là dự kiến; thanh toán chưa được mở.';}
  const upgrade=document.getElementById('view-upgrade');if(upgrade){upgrade.replaceChildren();const h=document.createElement('h1');h.className='view-title';h.textContent=en()?'Beta access':'Quyền lợi beta';const p=document.createElement('p');p.className='view-sub';p.textContent=en()?'There is no payment to complete. Continue using the available beta features.':'Hiện không có thanh toán cần thực hiện. Bạn có thể tiếp tục dùng các tính năng beta đã mở.';const b=document.createElement('button');b.type='button';b.className='btn btn-primary';b.textContent=en()?'Back to plans':'Quay lại gói cước';b.onclick=()=>showView('plan',document.querySelector('[data-view=plan]'));upgrade.append(h,p,b);}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update);else update();
 document.addEventListener('akk:languagechange',update);
})();
