/* Keep the movable assistant independent from page layout and keyboard resizing. */
(()=>{'use strict';
 const button=document.getElementById('chatToggle'),panel=document.getElementById('chatPanel');if(!button)return;
 const key='akk-widget-position-v1',vv=window.visualViewport;let saved=null,drag=null,frame=0,skipClick=false;
 try{const p=JSON.parse(localStorage.getItem(key));if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))saved={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))};}catch{}
 button.classList.add('kimkim-movable');button.title='Kéo để di chuyển · Chạm để mở KimKim / Drag to move · Tap to open';button.querySelector('img')?.setAttribute('draggable','false');
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function bounds(){const r=button.getBoundingClientRect(),x=vv?.offsetLeft||0,y=vv?.offsetTop||0,w=vv?.width||innerWidth,h=vv?.height||innerHeight;return {left:x+12,top:y+12,right:Math.max(x+12,x+w-r.width-12),bottom:Math.max(y+12,y+h-r.height-12),w,h,x,y};}
 function place(x,y){const b=bounds();button.style.setProperty('--kimkim-x',clamp(x,b.left,b.right)+'px');button.style.setProperty('--kimkim-y',clamp(y,b.top,b.bottom)+'px');positionPanel();}
 function positionPanel(){if(!panel?.classList.contains('open'))return;const b=bounds(),r=button.getBoundingClientRect(),p=panel.getBoundingClientRect();panel.classList.add('kimkim-anchored');panel.style.left=clamp(r.right-p.width,b.left,Math.max(b.left,b.x+b.w-p.width-12))+'px';panel.style.top=clamp(r.top-p.height-12,b.top,Math.max(b.top,b.y+b.h-p.height-12))+'px';}
 function layout(){frame=0;if(drag)return;const b=bounds();place(saved?b.left+saved.x*(b.right-b.left):b.right,saved?b.top+saved.y*(b.bottom-b.top):Math.max(b.top,b.bottom-(document.body.classList.contains('community-chat-open')?100:0)));}
 function schedule(){if(!frame)frame=requestAnimationFrame(layout);}
 function remember(){const b=bounds(),r=button.getBoundingClientRect();saved={x:(r.left-b.left)/(b.right-b.left||1),y:(r.top-b.top)/(b.bottom-b.top||1)};try{localStorage.setItem(key,JSON.stringify(saved));}catch{}}
 button.addEventListener('pointerdown',e=>{if(e.button!==0||!e.isPrimary)return;const r=button.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};button.setPointerCapture(e.pointerId);});
 button.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<6)return;drag.moved=true;button.classList.add('kimkim-dragging');place(drag.left+dx,drag.top+dy);});
 function finish(e){if(!drag||e.pointerId!==drag.id)return;const moved=drag.moved;drag=null;button.classList.remove('kimkim-dragging');if(moved){remember();skipClick=true;setTimeout(()=>skipClick=false,400);}schedule();}
 button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',finish);button.addEventListener('lostpointercapture',finish);
 button.addEventListener('click',e=>{if(skipClick){e.preventDefault();e.stopImmediatePropagation();skipClick=false;return;}requestAnimationFrame(()=>{button.setAttribute('aria-expanded',String(panel?.classList.contains('open')));positionPanel();});},true);
 button.addEventListener('keydown',e=>{const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!delta)return;e.preventDefault();const r=button.getBoundingClientRect();place(r.left+delta[0],r.top+delta[1]);remember();});
 function editing(){document.body.classList.toggle('kimkim-input-active',!!document.activeElement?.matches('input,textarea,[contenteditable=true]'));schedule();}
 document.addEventListener('focusin',editing);document.addEventListener('focusout',()=>requestAnimationFrame(editing));document.addEventListener('akk:viewchange',schedule);window.addEventListener('resize',schedule,{passive:true});vv?.addEventListener('resize',schedule,{passive:true});vv?.addEventListener('scroll',schedule,{passive:true});layout();
})();
