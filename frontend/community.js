/* Connections and person-to-person messaging. UI copy is intentionally separate
 * from AI conversations. User text is inserted with textContent, never HTML. */
(() => {
  'use strict';
  const S=window.CommunityService;
  const COPY={
    vi:{connections:'Kết nối',messages:'Tin nhắn',profile:'Hồ sơ kết nối',intro:'Kết nối với những người bạn muốn cùng làm việc và trao đổi.',inboxIntro:'Trò chuyện riêng với bạn bè. Nội dung không được gửi tới AI.',friends:'Bạn bè',received:'Lời mời đến',sent:'Đã gửi',blocked:'Đã chặn',find:'Tìm người',search:'Tìm kiếm',searchPh:'Nhập ít nhất 2 ký tự username',searchHelp:'Tìm theo @username. Email và nội dung riêng không hiển thị ở đây.',noFriends:'Bạn chưa có kết nối nào',noFriendsHelp:'Tìm @username của một người bạn để gửi lời mời kết bạn.',noRequests:'Không có lời mời',noBlocked:'Bạn chưa chặn ai',noResults:'Chưa tìm thấy người phù hợp',retry:'Thử lại',loading:'Đang tải…',add:'Kết bạn',accept:'Chấp nhận',decline:'Từ chối',cancel:'Huỷ lời mời',unfriend:'Huỷ kết bạn',unfriendConfirm:'Huỷ kết bạn với người này? Lịch sử trò chuyện vẫn được giữ.',message:'Nhắn tin',block:'Chặn',unblock:'Bỏ chặn',blockConfirm:'Chặn người này? Họ sẽ không thể gửi thêm tin nhắn hoặc lời mời cho bạn.',report:'Báo cáo',reportSent:'Đã ghi nhận báo cáo.',setup:'Kết nối đang được chuẩn bị',setupHelp:'Tính năng sẽ được mở sau khi cấu hình quyền dữ liệu hoàn tất. Các tính năng ghi âm và AI vẫn dùng như trước.',onboard:'Tạo hồ sơ để bắt đầu kết nối',onboardHelp:'Chỉ tên, username, giới thiệu và ảnh bạn chọn được hiển thị cho thành viên đã đăng nhập. Email và dữ liệu cuộc họp luôn tách riêng.',name:'Tên hiển thị',handle:'Username',handleHelp:'3–24 ký tự a–z, 0–9 hoặc _. Username cố định sau khi tạo.',bio:'Giới thiệu',googlePhoto:'Dùng ảnh đại diện của tài khoản đăng nhập',save:'Lưu hồ sơ',publish:'Tạo hồ sơ kết nối',edit:'Sửa hồ sơ của tôi',saved:'Đã lưu hồ sơ.',back:'Quay lại',emptyInbox:'Chưa có cuộc trò chuyện',emptyInboxHelp:'Kết bạn để bắt đầu cuộc trò chuyện đầu tiên.',choose:'Chọn một cuộc trò chuyện',chooseHelp:'Bạn có thể mở hồ sơ của bạn bè rồi chọn Nhắn tin.',noMessages:'Bắt đầu câu chuyện của bạn',messagePh:'Viết tin nhắn…',send:'Gửi',sending:'Đang gửi…',sentStatus:'Đã gửi',failed:'Gửi thất bại',loadOlder:'Xem tin nhắn cũ hơn',readOnly:'Bạn chưa thể gửi tin nhắn. Hãy kiểm tra trạng thái kết bạn hoặc bỏ chặn.',offline:'Bạn đang offline. Bản nháp vẫn được giữ trong phiên này.',online:'Đang đồng bộ trực tiếp',reportReason:'Lý do báo cáo',spam:'Spam',abuse:'Quấy rối hoặc nội dung không phù hợp',other:'Khác',detail:'Chi tiết bổ sung',reportHelp:'Báo cáo sẽ được đội vận hành xem xét. Không đưa mật khẩu hoặc thông tin thanh toán vào nội dung.',newMessage:'Có tin mới',notFound:'Hồ sơ này chưa được tạo hoặc không còn khả dụng.',copy:'Sao chép liên kết hồ sơ',copied:'Đã sao chép liên kết.',limit:'Đang hiển thị tối đa 50 mục trong beta.',signIn:'Vui lòng đăng nhập.',generic:'Không thể hoàn tất. Vui lòng thử lại.',permission:'Không thể thực hiện thao tác. Quyền kết nối có thể chưa được cấu hình hoặc đã thay đổi.',rate:'Bạn thao tác quá nhanh. Chờ vài giây rồi thử lại.',taken:'Username đã được sử dụng.',format:'Username cần 3–24 ký tự a–z, 0–9 hoặc _.',immutable:'Username đã cố định sau khi tạo.',profileFormat:'Tên cần 2–80 ký tự; giới thiệu tối đa 300 ký tự.',messageFormat:'Tin nhắn cần từ 1 đến 2.000 ký tự.',already:'Bạn đã gửi lời mời hoặc đã là bạn bè.',unknown:'Thành viên',new:'Cuộc trò chuyện mới',pending:'Đang chờ phản hồi',you:'Bạn',permissionTitle:'Chưa tải được dữ liệu',close:'Đóng',reportMessage:'Báo cáo tin này',privacy:'Tin nhắn chỉ dành cho người tham gia. Hãy cân nhắc trước khi chia sẻ thông tin nhạy cảm.'},
    en:{connections:'Connections',messages:'Messages',profile:'Connection profile',intro:'Connect with people you want to work and share ideas with.',inboxIntro:'Private conversations with friends. Messages are not sent to AI.',friends:'Friends',received:'Requests',sent:'Sent',blocked:'Blocked',find:'Find people',search:'Search',searchPh:'Enter at least 2 username characters',searchHelp:'Search by @username. Email and private content are not shown here.',noFriends:'No connections yet',noFriendsHelp:'Search for a friend’s @username to send a request.',noRequests:'No requests',noBlocked:'No blocked people',noResults:'No matching people found',retry:'Try again',loading:'Loading…',add:'Add friend',accept:'Accept',decline:'Decline',cancel:'Cancel request',unfriend:'Unfriend',unfriendConfirm:'Unfriend this person? Your conversation history will remain.',message:'Message',block:'Block',unblock:'Unblock',blockConfirm:'Block this person? They will no longer be able to send you messages or requests.',report:'Report',reportSent:'Your report has been recorded.',setup:'Connections are being prepared',setupHelp:'This feature will open once data permissions are configured. Recording and AI features are still available.',onboard:'Create your connection profile',onboardHelp:'Only your name, username, bio and chosen photo are visible to signed-in members. Your email and meeting content stay separate.',name:'Display name',handle:'Username',handleHelp:'3–24 characters: a–z, 0–9 or _. Your username cannot be changed after creation.',bio:'Bio',googlePhoto:'Use my signed-in account photo',save:'Save profile',publish:'Create connection profile',edit:'Edit my profile',saved:'Profile saved.',back:'Back',emptyInbox:'No conversations yet',emptyInboxHelp:'Add a friend to start your first conversation.',choose:'Choose a conversation',chooseHelp:'Open a friend’s profile and select Message.',noMessages:'Start a conversation',messagePh:'Write a message…',send:'Send',sending:'Sending…',sentStatus:'Sent',failed:'Failed to send',loadOlder:'Load older messages',readOnly:'You cannot send messages yet. Check your friendship or unblock this person.',offline:'You are offline. Your draft is kept for this session.',online:'Live updates connected',reportReason:'Reason',spam:'Spam',abuse:'Harassment or inappropriate content',other:'Other',detail:'Additional details',reportHelp:'Your report will be reviewed by the team. Do not include passwords or payment information.',newMessage:'New message',notFound:'This profile has not been created or is no longer available.',copy:'Copy profile link',copied:'Profile link copied.',limit:'Showing up to 50 items during beta.',signIn:'Please sign in.',generic:'Could not complete this action. Please try again.',permission:'This action is unavailable. Connection permissions may not be configured or may have changed.',rate:'Too many actions. Wait a few seconds and try again.',taken:'That username is already taken.',format:'Use 3–24 characters: a–z, 0–9 or _.',immutable:'Your username cannot be changed after creation.',profileFormat:'Use 2–80 characters for your name and up to 300 for your bio.',messageFormat:'Messages must contain 1–2,000 characters.',already:'You already sent a request or are friends.',unknown:'Member',new:'New conversation',pending:'Awaiting response',you:'You',permissionTitle:'Could not load data',close:'Close',reportMessage:'Report this message',privacy:'Messages are visible to conversation members. Think carefully before sharing sensitive information.'}
  };
  const tr=k=>(COPY[typeof lang!=='undefined'&&lang==='en'?'en':'vi'][k]||k);
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn,cls='btn btn-ghost')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
  let me=null,own=null,enabled=null,failure=null,tab='friends',connections=[],blocks=[],threads=[],results=null,peer=null,peerProfile=null,active=null,epoch=0;
  let releases=[],listeners=[],messageOff=null,receiptOff=null,recent=[],older=[],cursor=null,olderCursor=null,more=true,loadingOlder=false;
  const profiles=new Map(),receipts=new Map(),pending=new Map(),drafts=new Map();
  let lastRead='',queryEpoch=0,profileEpoch=0,formSequence=0,reportTarget=null;
  const isView=v=>$('view-'+v)&&!$('view-'+v).classList.contains('hidden');
  const busy=new WeakSet();
  function errorText(err){
    const c=err?.code||err?.message||'';
    if(c.includes('permission-denied'))return tr('permission');
    if(c.includes('unavailable')||c.includes('network'))return navigator.onLine?tr('generic'):tr('offline');
    if(c.includes('resource-exhausted'))return tr('rate');
    const map={'community/handle-taken':'taken','community/handle-format':'format','community/handle-immutable':'immutable','community/profile-format':'profileFormat','community/message-format':'messageFormat','community/already-connected':'already','community/sign-in':'signIn'};
    return tr(map[c]||'generic');
  }
  async function action(b,fn){if(busy.has(b))return;busy.add(b);b.disabled=true;try{await fn();}catch(e){showError(errorText(e));}finally{busy.delete(b);if(b.isConnected)b.disabled=false;}}
  function showError(text){const box=document.querySelector('.community-view:not(.hidden) [data-community-error]');if(box){box.textContent=text;box.hidden=false;}else if(typeof notify==='function')notify(text);}
  function clearError(){const box=document.querySelector('.community-view:not(.hidden) [data-community-error]');if(box){box.textContent='';box.hidden=true;}}
  function avatar(profile){const a=el('span','community-avatar',(profile?.name||'?').slice(0,2).toUpperCase());
    if(/^https:\/\//.test(profile?.avatarUrl||'')){const img=el('img');img.src=profile.avatarUrl;img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();a.replaceChildren(img);}return a;}
  function empty(title,body){const n=el('div','community-empty');n.append(el('h2','',tr(title)));if(body)n.append(el('p','',tr(body)));return n;}
  function header(view,title,sub){const node=$('view-'+view);node.replaceChildren();const row=el('div','community-heading');const text=el('div');text.append(el('h1','view-title',tr(title)),el('p','view-sub',tr(sub)));row.append(text);node.append(row);const err=el('p','field-error');err.dataset.communityError='true';err.hidden=true;err.setAttribute('role','alert');node.append(err);return {node,row};}
  const connection=id=>connections.find(r=>r.members.includes(id));
  const blocked=id=>blocks.some(r=>r.id===id);
  const canSend=id=>connection(id)?.status==='accepted'&&!blocked(id);
  async function profile(id){if(profiles.has(id))return profiles.get(id);const start=epoch;const p=await S.getProfile(id);if(start===epoch)profiles.set(id,p);return p;}
  function attachStop(){listeners.splice(0).forEach(fn=>fn());messageOff?.();receiptOff?.();messageOff=receiptOff=null;}
  function reset(){epoch++;queryEpoch++;profileEpoch++;attachStop();releases.splice(0).forEach(fn=>fn());me=own=null;enabled=null;failure=null;connections=[];blocks=[];threads=[];results=null;peer=peerProfile=active=null;recent=[];older=[];cursor=olderCursor=null;lastRead='';profiles.clear();receipts.clear();pending.clear();drafts.clear();document.body.classList.remove('community-chat-open');
    for(const id of ['connections','messages','communityProfile'])$('view-'+id)?.replaceChildren();}
  function gate(view){
    if(!me){$('view-'+view).replaceChildren(empty('signIn'));return false;}
    if(enabled!==true){const root=$('view-'+view);root.replaceChildren(empty(enabled===null&&!failure?'loading':'setup',enabled===null&&!failure?null:'setupHelp'));
      if(failure||enabled===false)root.append(button(tr('retry'),()=>start(me)));return false;}
    if(!own){renderOnboarding(view);return false;}return true;
  }
  function renderOnboarding(view){const {node}=header(view,'onboard','onboardHelp');node.append(profileForm());}
  function profileForm(){
    const f=el('form','card community-profile-form');const suffix=++formSequence;f.id='communityProfileForm-'+suffix;
    function field(key,type,value,max){const wrap=el('div','field'),label=el('label','',tr(key));const input=el(type==='textarea'?'textarea':'input');input.name=key;input.id='communityField-'+key+'-'+suffix;label.htmlFor=input.id;if(type!=='textarea')input.type=type;input.value=value||'';input.maxLength=max;wrap.append(label,input);f.append(wrap);return input;}
    const name=field('name','text',own?.name||me.displayName,80);name.required=true;name.minLength=2;name.autocomplete='nickname';
    const handle=field('handle','text',own?.handle,24);handle.required=true;handle.pattern='[a-z0-9_]{3,24}';handle.minLength=3;handle.disabled=!!own;handle.autocapitalize='none';handle.spellcheck=false;
    const help=el('p','community-help',tr('handleHelp'));f.append(help);const bio=field('bio','textarea',own?.bio,300);bio.rows=3;
    const photo=el('label','community-check'),cb=el('input');cb.type='checkbox';cb.checked=!!own?.avatarUrl;cb.disabled=!me.photoURL;photo.append(cb,el('span','',tr('googlePhoto')));f.append(photo);
    const submit=el('button','btn btn-primary',tr(own?'save':'publish'));submit.type='submit';f.append(submit);
    f.onsubmit=e=>{e.preventDefault();action(submit,async()=>{await S.saveProfile({name:name.value,handle:handle.value,bio:bio.value,useGoogleAvatar:cb.checked});notify(tr('saved'));});};
    return f;
  }
  function renderConnections(){
    if(!gate('connections'))return;const searchValue=$('communitySearch')?.value||'';const {node,row}=header('connections','connections','intro');row.append(button(tr('edit'),()=>openProfile(me.uid)));
    const form=el('form','community-search');const input=el('input');input.type='search';input.placeholder=tr('searchPh');input.setAttribute('aria-label',tr('find'));input.minLength=2;input.maxLength=24;input.value=searchValue;input.id='communitySearch';input.autocapitalize='none';
    const submit=el('button','btn btn-primary',tr('search'));submit.type='submit';form.append(input,submit);form.onsubmit=e=>{e.preventDefault();if(input.value.trim().replace(/^@/,'').length<2){input.focus();return;}action(submit,async()=>{const version=++queryEpoch;const found=await S.search(input.value);if(version!==queryEpoch)return;results=found.filter(p=>p.id!==me?.uid);tab='find';renderConnections();});};node.append(form,el('p','community-help',tr('searchHelp')));
    const tabs=el('div','community-tabs');tabs.setAttribute('role','tablist');for(const key of ['friends','received','sent','blocked','find']){const b=button(tr(key),()=>{tab=key;renderConnections();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===key));b.classList.toggle('selected',tab===key);tabs.append(b);}node.append(tabs);
    const list=el('div','community-people');list.id='communityPeople';list.setAttribute('aria-live','polite');node.append(list);
    let ids=[];
    if(tab==='find'){if(results===null){list.append(empty('find','searchHelp'));return;}results.forEach(p=>profiles.set(p.id,p));ids=results.map(p=>p.id);}
    else if(tab==='blocked')ids=blocks.map(p=>p.id);
    else ids=connections.filter(r=>!blocked(r.members.find(id=>id!==me.uid))&&(tab==='friends'?r.status==='accepted':r.status==='pending'&&(tab==='received'?r.senderId!==me.uid:r.senderId===me.uid))).map(r=>r.members.find(id=>id!==me.uid));
    if(!ids.length){list.append(empty(tab==='friends'?'noFriends':tab==='blocked'?'noBlocked':tab==='find'?'noResults':'noRequests',tab==='friends'?'noFriendsHelp':null));return;}
    const start=epoch;for(const id of ids){const place=el('div','card community-person');place.append(el('p','',tr('loading')));list.append(place);profile(id).then(p=>{if(start!==epoch||!place.isConnected)return;place.replaceChildren();place.append(personRow(p||{id,name:tr('unknown')}));}).catch(e=>{if(place.isConnected)place.replaceChildren(el('p','field-error',errorText(e)));});}
    if(ids.length===50)node.append(el('p','community-help',tr('limit')));
  }
  function personRow(p){const row=el('div','community-person-content'),identity=button('',()=>openProfile(p.id),'community-identity');identity.append(avatar(p));const tx=el('span');tx.append(el('strong','',p.name),el('span','community-muted',p.handle?'@'+p.handle:''));identity.append(tx);row.append(identity);const actions=el('div','community-actions');row.append(actions);fillActions(actions,p.id);return row;}
  function bindAction(parent,key,fn,primary=false){const b=button(tr(key),()=>action(b,fn),primary?'btn btn-primary':'btn btn-ghost');parent.append(b);return b;}
  function fillActions(node,id){
    if(id===me.uid){bindAction(node,'copy',async()=>{await navigator.clipboard.writeText(location.origin+location.pathname+'#people/'+encodeURIComponent(id));notify(tr('copied'));});return;}
    if(blocked(id)){bindAction(node,'unblock',()=>S.unblock(id));return;}
    const c=connection(id);
    if(c?.status==='accepted'){bindAction(node,'message',()=>openChat(id),true);bindAction(node,'unfriend',async()=>{if(await confirmAction(tr('unfriendConfirm')))await S.unfriend(id);});}
    else if(c?.status==='pending'){if(c.senderId===me.uid)bindAction(node,'cancel',()=>S.respond(id,'cancelled'));else{bindAction(node,'accept',()=>S.respond(id,'accepted'),true);bindAction(node,'decline',()=>S.respond(id,'declined'));}}
    else bindAction(node,'add',()=>S.invite(id),true);
  }
  async function openProfile(id){if(!me||!enabled)return;if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))return;peer=id;peerProfile=null;const key=++profileEpoch;showView('communityProfile',document.querySelector('[data-view=connections]'));renderProfile();try{const p=await S.getProfile(id);if(key!==profileEpoch)return;peerProfile=p;profiles.set(id,p);renderProfile();}catch(e){if(key===profileEpoch)showError(errorText(e));}}
  function renderProfile(){
    if(!gate('communityProfile'))return;const {node,row}=header('communityProfile','profile','searchHelp');row.append(button(tr('back'),()=>navigate('connections')));
    if(peer===me.uid){node.append(profileForm());const preview=el('div','card community-profile-preview');preview.append(avatar(own),el('h2','',own.name),el('p','community-muted','@'+own.handle),el('p','',own.bio));node.append(preview);return;}
    if(!peerProfile){node.append(empty(profiles.has(peer)?'notFound':'loading'));return;}
    const card=el('section','card community-profile-preview');card.append(avatar(peerProfile),el('h2','',peerProfile.name),el('p','community-muted','@'+peerProfile.handle),el('p','',peerProfile.bio));const actions=el('div','community-actions');fillActions(actions,peer);card.append(actions);const secondary=el('div','community-actions');bindAction(secondary,'block',async()=>{if(await confirmAction(tr('blockConfirm')))await S.block(peer);});secondary.append(button(tr('report'),()=>openReport({peer})));card.append(secondary);node.append(card);
  }
  function navigate(view){showView(view,document.querySelector('[data-view='+view+']'));}
  async function openChat(id){
    const start=epoch;const threadId=await S.openThread(id);if(start!==epoch)return;peer=id;active=threadId;showView('messages',document.querySelector('[data-view=messages]'));selectThread(threadId,id);
  }
  function selectThread(id,other){
    messageOff?.();receiptOff?.();active=id;peer=other;recent=[];older=[];cursor=olderCursor=null;more=true;lastRead='';document.body.classList.add('community-chat-open');renderMessages();
    const start=epoch;
    messageOff=S.watchMessages(id,(rows,last)=>{if(start!==epoch||active!==id)return;recent=rows;cursor=last;if(!older.length)more=rows.length===30;
      const cache=pending.get(id);if(cache)for(const row of rows)if(!row.pendingWrite)cache.delete(row.id);
      renderConversation();markRead();},e=>{if(start===epoch&&active===id)showError(errorText(e));});
    receiptOff=S.watchReceipt(id,r=>{if(start===epoch){receipts.set(id,r?.readAt?.toMillis?.()||0);renderThreadList();}},()=>{});
    profile(other).then(()=>{if(start===epoch&&active===id)renderConversation();}).catch(e=>showError(errorText(e)));
  }
  function unread(t){return t.lastText&&t.lastSenderId!==me.uid&&(t.updatedAt?.toMillis?.()||0)>(receipts.get(t.id)||0);}
  function renderMessages(){
    if(!gate('messages'))return;const {node}=header('messages','messages','inboxIntro');const shell=el('div','community-inbox card');shell.id='communityInbox';if(active)shell.classList.add('has-active');
    const list=el('aside','community-threads');list.id='communityThreads';const chat=el('section','community-conversation');chat.id='communityConversation';chat.setAttribute('aria-label',tr('messages'));shell.append(list,chat);node.append(shell);renderThreadList();renderConversation();
  }
  function renderThreadList(){
    const list=$('communityThreads');if(!list||!me)return;list.replaceChildren();
    if(!threads.length){list.append(empty('emptyInbox','emptyInboxHelp'),button(tr('find'),()=>navigate('connections')));return;}
    for(const thread of threads){const other=thread.members.find(id=>id!==me.uid),p=profiles.get(other);const b=button('',()=>selectThread(thread.id,other),'community-thread');b.classList.toggle('selected',thread.id===active);b.setAttribute('aria-current',thread.id===active?'true':'false');b.append(avatar(p));const text=el('span','community-thread-text');text.append(el('strong','',p?.name||tr('unknown')),el('span','',thread.lastText||tr('new')));b.append(text);if(unread(thread)){const dot=el('span','community-unread');dot.setAttribute('aria-label',tr('newMessage'));b.append(dot);}list.append(b);}
    if(threads.length===50)list.append(el('p','community-help',tr('limit')));
  }
  function renderConversation(){
    const root=$('communityConversation');if(!root||!me)return;
    if(!active){root.replaceChildren(empty('choose','chooseHelp'));return;}
    // Preserve typing and scroll position across snapshots and locale updates.
    const focused=document.activeElement?.id==='communityMessageInput',selStart=$('communityMessageInput')?.selectionStart,selEnd=$('communityMessageInput')?.selectionEnd;
    const oldList=$('communityMessageList'),nearBottom=!oldList||oldList.scrollHeight-oldList.scrollTop-oldList.clientHeight<80,scroll=oldList?.scrollTop||0;
    root.replaceChildren();const p=profiles.get(peer);const head=el('div','community-chat-head');head.append(button('←',()=>{messageOff?.();receiptOff?.();messageOff=receiptOff=null;active=null;document.body.classList.remove('community-chat-open');renderMessages();},'btn btn-ghost community-back'));
    const who=button('',()=>openProfile(peer),'community-identity');who.append(avatar(p),el('strong','',p?.name||tr('unknown')));head.append(who,button(tr('report'),()=>openReport({peer,threadId:active})));root.append(head);
    const list=el('div','community-message-list');list.id='communityMessageList';list.setAttribute('role','log');list.setAttribute('aria-live','polite');list.setAttribute('aria-relevant','additions');
    if(more){const b=button(loadingOlder?tr('loading'):tr('loadOlder'),()=>action(b,loadOlder));b.disabled=loadingOlder;list.append(b);}
    const all=new Map([...older,...recent].map(m=>[m.id,m]));for(const m of (pending.get(active)||new Map()).values())if(!all.has(m.id))all.set(m.id,m);
    if(!all.size)list.append(empty('noMessages'));
    for(const m of all.values()){
      const mine=m.senderId===me.uid,row=el('article','community-message '+(mine?'mine':'theirs'));row.append(el('p','',m.text));
      const state=m.localState||(m.createdAt? 'sentStatus':'sending');const when=m.createdAt?.toDate?.();row.append(el('small','',m.localState?tr(state):when?when.toLocaleTimeString(typeof lang!=='undefined'&&lang==='en'?'en-GB':'vi-VN',{hour:'2-digit',minute:'2-digit'}):tr('sending')));
      if(m.localState==='failed'){const b=button(tr('retry'),()=>action(b,()=>attemptSend(active,m)));row.append(b);}else if(!mine)row.append(button(tr('reportMessage'),()=>openReport({peer,threadId:active,messageId:m.id}),'community-message-report'));
      list.append(row);
    }
    root.append(list);
    const hint=el('p','community-chat-status',!navigator.onLine?tr('offline'):canSend(peer)?tr('privacy'):tr('readOnly'));hint.setAttribute('role','status');root.append(hint);
    const form=el('form','community-composer'),input=el('textarea');input.id='communityMessageInput';input.rows=2;input.maxLength=2000;input.placeholder=tr('messagePh');input.setAttribute('aria-label',tr('messagePh'));input.value=drafts.get(active)||'';input.oninput=()=>drafts.set(active,input.value);input.disabled=!canSend(peer);
    const submit=el('button','btn btn-primary',tr('send'));submit.type='submit';submit.disabled=!navigator.onLine||!canSend(peer);form.append(input,submit);root.append(form);
    form.onsubmit=e=>{e.preventDefault();if(!navigator.onLine||!canSend(peer))return;const text=input.value.trim();if(!text)return;const id=active,m={id:S.messageId(),senderId:me.uid,text,localState:'sending'};if(!pending.has(id))pending.set(id,new Map());pending.get(id).set(m.id,m);drafts.set(id,'');input.value='';attemptSend(id,m);renderConversation();};
    // Enter sends; Shift+Enter adds a new line. IME composition remains native.
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
    list.scrollTop=nearBottom?list.scrollHeight:scroll;if(focused&&!input.disabled){input.focus({preventScroll:true});input.setSelectionRange(selStart||0,selEnd||0);}
  }
  async function attemptSend(id,m){const start=epoch;m.localState='sending';if(active===id)renderConversation();try{await S.sendMessage(id,m.text,m.id);if(start!==epoch)return;m.localState='sentStatus';}catch(e){if(start!==epoch)return;m.localState='failed';showError(errorText(e));}if(active===id)renderConversation();}
  async function loadOlder(){if(loadingOlder)return;loadingOlder=true;const id=active,start=epoch;try{const data=await S.olderMessages(id,olderCursor||cursor);if(start!==epoch||id!==active)return;older=[...data.rows,...older];olderCursor=data.cursor;more=data.rows.length===30;}finally{loadingOlder=false;if(start===epoch&&id===active)renderConversation();}}
  function markRead(){if(!active||!isView('messages')||document.visibilityState!=='visible'||!recent.length)return;const latest=recent.at(-1);if(!latest.createdAt||lastRead===latest.id)return;lastRead=latest.id;S.markRead(active).catch(()=>{lastRead='';});}
  function openReport(target){reportTarget=target;const dialog=$('communityReportDialog');dialog.replaceChildren();const form=el('form');form.append(el('h2','',tr('report')),el('p','community-help',tr('reportHelp')));const label=el('label','',tr('reportReason')),select=el('select');select.id='communityReportReason';label.htmlFor=select.id;for(const key of ['spam','abuse','other']){const o=el('option','',tr(key));o.value=key;select.append(o);}const detailLabel=el('label','',tr('detail')),detail=el('textarea');detail.id='communityReportDetail';detailLabel.htmlFor=detail.id;detail.maxLength=500;detail.rows=3;form.append(label,select,detailLabel,detail);const actions=el('div','community-actions'),cancel=button(tr('close'),()=>dialog.close()),submit=el('button','btn btn-primary',tr('report'));submit.type='submit';actions.append(cancel,submit);form.append(actions);const error=el('p','field-error');error.setAttribute('role','alert');form.append(error);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await S.report({...reportTarget,reason:select.value,detail:detail.value.trim()});dialog.close();notify(tr('reportSent'));}catch(err){error.textContent=errorText(err);}finally{submit.disabled=false;}};dialog.append(form);dialog.showModal();}
  function refresh(){
    for(const key of ['connections','messages']){const n=document.querySelector('[data-view='+key+']');if(n){n.querySelector('.community-nav-label').textContent=tr(key);n.setAttribute('aria-label',tr(key));n.title=tr(key);}}
    if(isView('connections'))renderConnections();if(isView('messages'))renderMessages();if(isView('communityProfile'))renderProfile();
  }
  async function start(user){
    reset();me=user;if(!user)return;const start=epoch;
    const failed=e=>{if(start!==epoch)return;failure=e;enabled=false;refresh();};
    releases.push(S.watchRelease(on=>{
      if(start!==epoch)return;enabled=on;failure=null;
      if(!on){attachStop();own=null;refresh();return;}
      listeners.push(S.watchProfile(user.uid,p=>{if(start!==epoch)return;const first=!own&&!!p;own=p;if(p)profiles.set(user.uid,p);if(first)attachCommunity(start);refresh();},failed));refresh();
    },failed));
    refresh();
  }
  function attachCommunity(start){
    listeners.push(S.watchConnections(rows=>{if(start!==epoch)return;connections=rows;refresh();},showErrorFromSnapshot));
    listeners.push(S.watchBlocks(rows=>{if(start!==epoch)return;blocks=rows;refresh();},showErrorFromSnapshot));
    listeners.push(S.watchThreads(rows=>{if(start!==epoch)return;threads=rows;for(const t of rows){const other=t.members.find(id=>id!==me.uid);if(!profiles.has(other))profile(other).then(()=>{if(start===epoch)renderThreadList();}).catch(()=>{});if(!receipts.has(t.id)){receipts.set(t.id,0);S.getReceipt(t.id).then(r=>{if(start===epoch){receipts.set(t.id,r?.readAt?.toMillis?.()||0);renderThreadList();}}).catch(()=>{});}}renderThreadList();},showErrorFromSnapshot));
    if(location.hash.startsWith('#people/')){const id=decodeURIComponent(location.hash.slice(8));openProfile(id);}
  }
  function showErrorFromSnapshot(e){showError(errorText(e));}
  function boot(){
    const nav=document.querySelector('.sidebar .nav-item[data-view=team]');for(const [key,symbol] of [['connections','M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6m-3-3h6'],['messages','M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z']]){const b=button('',()=>navigate(key),'nav-item community-nav');b.dataset.view=key;const ic=el('span','ic');ic.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="'+symbol+'"/></svg>';b.append(ic,el('span','community-nav-label',tr(key)));nav.before(b);}
    const main=$('view-home').parentElement;for(const key of ['connections','messages','communityProfile']){const v=el('div','view hidden community-view');v.id='view-'+key;main.append(v);}
    const dialog=el('dialog','confirm-dialog community-report-dialog');dialog.id='communityReportDialog';dialog.setAttribute('aria-label',tr('report'));document.body.append(dialog);
    document.addEventListener('akk:viewchange',e=>{if(e.detail.view!=='messages'){document.body.classList.remove('community-chat-open');messageOff?.();receiptOff?.();messageOff=receiptOff=null;}else if(active){document.body.classList.add('community-chat-open');if(!messageOff)selectThread(active,peer);}refresh();markRead();});
    document.addEventListener('akk:languagechange',refresh);
    document.addEventListener('visibilitychange',markRead);
    const viewport=()=>document.documentElement.style.setProperty('--community-viewport',(window.visualViewport?.height||window.innerHeight)+'px');viewport();window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
    window.addEventListener('online',()=>{if(isView('messages'))renderConversation();});window.addEventListener('offline',()=>{if(isView('messages'))renderConversation();});
    window.addEventListener('hashchange',()=>{if(me&&enabled&&location.hash.startsWith('#people/'))openProfile(decodeURIComponent(location.hash.slice(8)));});
    if(window.FirebaseClient?.ready)AuthService.onAuthChange(start);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
