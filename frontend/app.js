/* ================= App state =================
   Firebase init now lives in services/firebaseClient.js.
   UI code below only talks to *Service objects (AuthService,
   MeetingService, NoteService, TeamService, UploadService,
   SettingsService, AiService) — never to firebase.* directly.
*/
let currentUser = null;
let unsubscribers = []; // realtime listeners to clean up on logout
function firebaseReadyCheck(){ return FirebaseClient.ready; }

/* ---------------- i18n ---------------- */
const I18N = window.I18N || { vi: {}, en: {} };
let lang='vi';
try { lang=localStorage.getItem('akk_lang')==='en'?'en':'vi'; } catch {}
function t(key){ return (I18N[lang] && I18N[lang][key]) || key; }
function setLang(l){
  if (!['vi','en'].includes(l)) return;
  lang=l;
  document.documentElement.lang=l;
  try { localStorage.setItem('akk_lang',l); } catch {}
  document.querySelectorAll('[data-auth-lang]').forEach(el=>{
    el.classList.toggle('active',el.dataset.authLang===l);
    el.setAttribute('aria-pressed',String(el.dataset.authLang===l));
  });
  document.getElementById('btnVi').classList.toggle('active',l==='vi');
  document.getElementById('btnEn').classList.toggle('active',l==='en');
  document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.dataset.i18n; if(I18N[l][k]) el.innerHTML=I18N[l][k];});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{const k=el.dataset.i18nPh; if(I18N[l][k]) el.placeholder=I18N[l][k];});
  renderAll();
  if(currentUser) updateUserUI(currentUser);
  if(typeof RecordingRefreshLang==='function') RecordingRefreshLang();
  document.dispatchEvent(new Event('akk:languagechange'));
}

/* ---------------- Auth / Firebase ---------------- */
function showAuth(which){
  ['signin','signup','forgot'].forEach(k=>document.getElementById('auth'+k[0].toUpperCase()+k.slice(1)).classList.add('hidden'));
  document.getElementById('auth'+which[0].toUpperCase()+which.slice(1)).classList.remove('hidden');
  clearAuthErrors();
}
function clearAuthErrors(){
  ['authError','signupError','resetError'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='';});
}
function requireFirebase(){
  if(!firebaseReadyCheck()){
    notify(t('needFirebaseConfig'));
    return false;
  }
  return true;
}
async function signInWithEmail(){
  if(!requireFirebase())return;
  clearAuthErrors();
  const email=document.getElementById('signinEmail').value.trim();
  const password=document.getElementById('signinPassword').value;
  try{ await AuthService.signInEmail(email,password); }
  catch(err){ document.getElementById('authError').textContent=err.message; }
}
async function signUpWithEmail(){
  if(!requireFirebase())return;
  clearAuthErrors();
  const name=document.getElementById('signupName').value.trim();
  const email=document.getElementById('signupEmail').value.trim();
  const password=document.getElementById('signupPassword').value;
  if(!name){document.getElementById('signupError').textContent=t('pleaseEnterName');return;}
  try{ await AuthService.signUpEmail(name,email,password); }
  catch(err){ document.getElementById('signupError').textContent=err.message; }
}
async function signInWithGoogle(){
  if(!requireFirebase())return;
  clearAuthErrors();
  try{
    await AuthService.signInGoogle();
  } catch(err){
    console.error("signInWithGoogle error:", err);
    document.getElementById('authError').textContent = err.message || 'Đăng nhập Google thất bại.';
  }
}
async function sendPasswordReset(){
  if(!requireFirebase())return;
  clearAuthErrors();
  const email=document.getElementById('resetEmail').value.trim();
  try{
    await AuthService.sendPasswordReset(email);
    document.getElementById('resetError').style.color='var(--green)';
    document.getElementById('resetError').textContent='Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư.';
  }catch(err){
    document.getElementById('resetError').style.color='#fca5a5';
    document.getElementById('resetError').textContent=err.message;
  }
}

function enterApp(user){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('app').classList.add('active');
  currentUser=user;
  if(user){
    try { updateUserUI(user); } catch(e){ console.error("updateUserUI error:", e); }
    AuthService.ensureUserDoc(user).then(()=>{
      loadUserSettings();
      loadPlan();
    }).catch(e => console.warn("ensureUserDoc non-fatal error in enterApp:", e));
    try { attachRealtimeListeners(user.uid); } catch(e){ console.error("attachRealtimeListeners error:", e); }
    try { loadChatHistory(); } catch(e){ console.error("loadChatHistory error:", e); }
  }
}
function applyAvatar(el,user,initialsText){
  if(!el)return;
  if(user && user.photoURL){ el.style.backgroundImage=`url('${user.photoURL}')`; el.textContent=''; }
  else { el.style.backgroundImage='none'; el.textContent=initialsText; }
}
function updateUserUI(user){
  const name=user.displayName || (user.email ? user.email.split('@')[0] : 'User');
  const initialsText=initials(name);
  applyAvatar(document.getElementById('sideAvatar'),user,initialsText);
  applyAvatar(document.getElementById('profileAvatar'),user,initialsText);
  const sideName=document.getElementById('sideUserName');
  const hero=document.querySelector('[data-i18n="heroTitle"]');
  if(sideName)sideName.textContent=name;
  if(hero){hero.textContent=lang==='vi'?`Hi ${name}, chào mừng đến với Adolf KimKim 💙`:`Hi ${name}, Welcome to Adolf KimKim 💙`;}
  const nameInput=document.querySelector('#settingsAccount .field input');
  const emailInput=document.querySelectorAll('#settingsAccount .field input')[1];
  if(nameInput)nameInput.value=name;
  if(emailInput)emailInput.value=user.email || '';
  const pName=document.getElementById('profileNameInput');
  const pEmail=document.getElementById('profileEmailInput');
  if(pName)pName.value=name;
  if(pEmail)pEmail.value=user.email || '';
}
async function saveProfileName(){
  if(!currentUser) return;
  const el=document.getElementById('profileNameInput');
  const newName=el ? el.value.trim() : '';
  if(!newName){ notify(t('pleaseEnterName')); return; }
  try{ await AuthService.updateProfileName(newName); updateUserUI(firebase.auth().currentUser); notify(t('savedMsg')); }
  catch(err){ notify(err.message); }
}
async function handleAvatarSelected(input){
  const file=input.files[0];
  if(!file) return;
  const statusEl=document.getElementById('avatarUploadStatus');
  if(statusEl) statusEl.textContent=t('avatarUploading');
  try{
    await AvatarService.uploadAvatar(file);
    updateUserUI(firebase.auth().currentUser);
    if(statusEl) statusEl.textContent=t('avatarUploaded');
  }catch(err){
    if(statusEl) statusEl.textContent=err.message;
  }
  input.value='';
}
function detachListeners(){
  unsubscribers.forEach(u=>{try{u();}catch(e){}});
  unsubscribers=[];
  if (chatUnsub) { try { chatUnsub(); } catch(e){} chatUnsub = null; }
  globalChatHistoryCache = [];
  const body = document.getElementById('chatBody');
  if (body) {
    const greetingText = (typeof I18N !== 'undefined' && I18N[lang] && I18N[lang].greeting)
      ? I18N[lang].greeting
      : 'Chào bạn 👋 Tôi là KimKim. Hỏi tôi những gì bạn muốn.';
    body.innerHTML = `<div class="bubble agent">${escapeHtml(greetingText)}</div>`;
  }
}
function logout(){
  detachListeners();
  currentUser=null;
  if(firebaseReadyCheck()){AuthService.signOut();return;}
  document.getElementById('app').classList.remove('active');
  document.getElementById('authScreen').style.display='flex';
  showAuth('signin');
}
function initAuth(){
  if(!firebaseReadyCheck())return;
  AuthService.onAuthChange(user=>{
    if(user){enterApp(user);}else{
      detachListeners();
      currentUser=null;
      document.getElementById('app').classList.remove('active');
      document.getElementById('authScreen').style.display='flex';
      showAuth('signin');
    }
  });
}

function toggleMobileMenu(){
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.getElementById('sidebarBackdrop')?.classList.toggle('open');
}
function closeMobileMenu(){
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}

/* ---------------- View switching ---------------- */
function toggleAddNewMenu(e){
  if(e) e.stopPropagation();
  const m = document.getElementById('addNewMenu');
  if(!m) return;
  m.classList.toggle('hidden');
  if(!m.classList.contains('hidden')){
    document.addEventListener('click', closeAddNewMenu, {once:true});
  }
}
function closeAddNewMenu(){
  const m = document.getElementById('addNewMenu');
  if(m) m.classList.add('hidden');
}
function showView(v,el){
  closeMobileMenu();
  if (v !== 'meetingDetail') {
    if (isMeetingRecording) stopMeetingRecording();
    if (currentMeetingId && segments && segments.length > 0) {
      const durStr = recordingSeconds ? fmt(recordingSeconds) : (currentMeetingObj?.dur || '00:00');
      MeetingService.updateMeeting(currentMeetingId, {
        transcript: segments,
        dur: durStr
      }).catch(e => console.warn("auto-save transcript warning:", e));
      if (currentMeetingObj) {
        currentMeetingObj.transcript = segments;
        currentMeetingObj.dur = durStr;
      }
    }
  }
  document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));
  const target=document.getElementById('view-'+v);
  if(target) target.classList.remove('hidden');
  if(el){ document.querySelectorAll('.nav-item[data-view]').forEach(n=>n.classList.remove('active')); el.classList.add('active'); }
}
function showSettings(section, element){
  const ids={account:'settingsAccount',meeting:'settingsMeeting',ai:'settingsAI',password:'settingsPassword'};
  if(!ids[section]) return;
  for(const [key,id] of Object.entries(ids)) document.getElementById(id)?.classList.toggle('hidden',key!==section);
  for(const tab of document.querySelectorAll('.settings-tabs [data-s]')){
    const selected=tab.dataset.s===section;
    tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));
  }
}
function toggleSettingSwitch(button){
  button.classList.toggle('on');button.setAttribute('aria-checked',String(button.classList.contains('on')));
}

/* ---------------- Data & render — all reads/writes go through the *Service layer ---------------- */
let meetings=[];
let meetingsState='loading'; // 'loading' | 'ready' | 'error'
let notesArr=[];
let teamArr=[];
let uploadsArr=[];
let segments=[];
let currentMeetingId=null;
let currentMeetingObj=null;
let currentNoteId=null;
let activeMeetingFilter='all';
let searchQuery='';
let editingMeetingId=null; // null => create mode in the create/edit form
let currentSummaryData=null; // last AI summary result {title,key_points,summary}

// STT state variables (must be declared before any render calls)
let isMeetingRecording = false;
let sttWs = null, audioCtx = null, processor = null, micStream = null;
let recordingTimer = null, recordingSeconds = 0;
let livePartialText = "";
let livePartialSpeaker = "Sally";
let lastFinalText = "";

function escapeHtml(text) {
  return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attachRealtimeListeners(u){
  meetingsState='loading'; renderAll();
  unsubscribers.push(MeetingService.watchMeetings(rows=>{
    meetings=rows; meetingsState='ready';
    if(currentMeetingId){ currentMeetingObj = meetings.find(m=>m.id===currentMeetingId) || currentMeetingObj; }
    renderAll();
  }, ()=>{ meetingsState='error'; renderAll(); }));
  unsubscribers.push(NoteService.watchNotes(rows=>{
    notesArr=rows;
    if(!currentNoteId && notesArr[0]) currentNoteId=notesArr[0].id;
    renderAll();
  }));
  unsubscribers.push(TeamService.watchMembers(rows=>{ teamArr=rows; renderAll(); }));
  unsubscribers.push(UploadService.watchUploads(rows=>{ uploadsArr=rows; renderAll(); }));
}

function loadUserSettings(){
  SettingsService.getSettings().then(s=>{
    const langSel=document.querySelector('#settingsMeeting select');
    if(langSel) langSel.value = s.meetingLang==='en' ? 'English' : 'Tiếng Việt';
    const toggles=document.querySelectorAll('#settingsMeeting .switch');
    if(toggles[0]) toggles[0].classList.toggle('on', !!s.autoJoin);
    if(toggles[1]) toggles[1].classList.toggle('on', !!s.autoRecord);
    const styleSel=document.querySelector('#settingsAI select');
    if(styleSel) styleSel.value = s.speechStyle==='casual' ? I18N[lang].styleCasual : I18N[lang].styleFormal;
    const aiToggle=document.querySelector('#settingsAI .switch');
    if(aiToggle) aiToggle.classList.toggle('on', !!s.vocabDetect);
    document.querySelectorAll('.settings-pane .switch').forEach(button=>button.setAttribute('aria-checked',String(button.classList.contains('on'))));
  }).catch(err=>notify(err.message));
}
function saveMeetingSettings(){
  const langSel=document.querySelector('#settingsMeeting select');
  const toggles=document.querySelectorAll('#settingsMeeting .switch');
  SettingsService.saveMeetingSettings({
    meetingLang: langSel && langSel.value==='English' ? 'en' : 'vi',
    autoJoin: toggles[0] ? toggles[0].classList.contains('on') : true,
    autoRecord: toggles[1] ? toggles[1].classList.contains('on') : false
  }).then(()=>notify(t('savedMsg'))).catch(err=>notify(err.message));
}
function saveAISettings(){
  const styleSel=document.querySelector('#settingsAI select');
  const aiToggle=document.querySelector('#settingsAI .switch');
  SettingsService.saveAISettings({
    speechStyle: styleSel && styleSel.value===I18N[lang].styleCasual ? 'casual' : 'formal',
    vocabDetect: aiToggle ? aiToggle.classList.contains('on') : true
  }).then(()=>notify(t('savedMsg'))).catch(err=>notify(err.message));
}
async function saveAccountSettings(){
  if(!currentUser) return;
  const nameInput=document.querySelector('#settingsAccount .field input');
  const newName=nameInput ? nameInput.value.trim() : '';
  if(!newName){notify(t('pleaseEnterName'));return;}
  try{ await AuthService.updateProfileName(newName); updateUserUI(currentUser); notify(t('savedMsg')); }
  catch(err){ notify(err.message); }
}
async function updatePasswordSettings(){
  if(!currentUser) return;
  const inputs=document.querySelectorAll('#settingsPassword input[type=password]');
  const curPw=inputs[0] ? inputs[0].value : '';
  const newPw=inputs[1] ? inputs[1].value : '';
  if(!curPw || !newPw){notify(t('pleaseEnterBothPw'));return;}
  try{ await AuthService.changePassword(curPw,newPw); notify(t('pwUpdatedMsg')); inputs.forEach(i=>i.value=''); }
  catch(err){ notify(err.message); }
}
async function deleteAccount(){
  if(!currentUser) return;
  if(!await confirmAction(t('confirmDeleteAccount'))) return;
  try{ await AuthService.deleteAccount(); notify(t('accountDeletedMsg')); }
  catch(err){ notify(t('reauthRequiredMsg')+err.message); }
}

function loadPlan(){
  SettingsService.getPlan().then(plan=>{
    const el=document.querySelector('[data-i18n="planSub"]');
    if(el) el.innerHTML=(lang==='vi'?'Bạn đang dùng gói ':'You are on the plan ')+`<b>${plan}</b>`;
  });
}

/* ---- Create / Edit / Delete Meeting ---- */
function openCreateMeeting(status){
  editingMeetingId=null;
  document.getElementById('cmFormTitle').textContent = I18N[lang].createMeetingTitle;
  document.getElementById('cmSubmitBtn').textContent = I18N[lang].createBtn;
  document.getElementById('cmTitle').value='';
  const now=new Date();
  document.getElementById('cmDate').value=now.toISOString().slice(0,10);
  document.getElementById('cmTime').value=now.toTimeString().slice(0,5);
  document.getElementById('cmParticipants').value='';
  const meetInput=document.getElementById('cmMeetUrl');
  if(meetInput) meetInput.value='';
  document.getElementById('cmDescription').value='';
  document.getElementById('cmError').textContent='';
  document.getElementById('view-createMeeting').dataset.status=status||'processing';
  showView('createMeeting');
}
function editMeeting(id){
  const m=meetings.find(x=>x.id===id); if(!m) return;
  editingMeetingId=id;
  document.getElementById('cmFormTitle').textContent = I18N[lang].editMeetingTitle;
  document.getElementById('cmSubmitBtn').textContent = I18N[lang].saveBtn;
  document.getElementById('cmTitle').value=m.title||'';
  document.getElementById('cmDate').value=m.date||'';
  document.getElementById('cmTime').value=m.time||'';
  document.getElementById('cmParticipants').value=(m.participants||[]).join(', ');
  const meetInput=document.getElementById('cmMeetUrl');
  if(meetInput) meetInput.value=m.meetUrl||'';
  document.getElementById('cmDescription').value=m.description||'';
  document.getElementById('cmError').textContent='';
  showView('createMeeting');
}
function cancelCreateMeeting(){
  showView(editingMeetingId ? 'meetingDetail' : 'meetings', document.querySelector('[data-view=meetings]'));
}
async function submitCreateMeeting(){
  const title=document.getElementById('cmTitle').value.trim();
  const date=document.getElementById('cmDate').value;
  const time=document.getElementById('cmTime').value;
  const participants=document.getElementById('cmParticipants').value.split(',').map(s=>s.trim()).filter(Boolean);
  const meetUrl=(document.getElementById('cmMeetUrl')?.value || '').trim();
  const description=document.getElementById('cmDescription').value.trim();
  const inviteKimkimEl=document.getElementById('cmInviteKimkim');
  const inviteKimkim=inviteKimkimEl?inviteKimkimEl.classList.contains('on'):false;
  if(!title){ document.getElementById('cmError').textContent=t('pleaseEnterTitle'); return; }
  if(!date){ document.getElementById('cmError').textContent=t('pleaseSelectDate'); return; }
  try{
    if(editingMeetingId){
      await MeetingService.updateMeeting(editingMeetingId, {title,date,time,participants,meetUrl,description,inviteKimkim});
      currentMeetingId=editingMeetingId;
      openMeeting(editingMeetingId);
      if(meetUrl && inviteKimkim){
        startMeetBotJob(meetUrl, title, editingMeetingId);
      }
    } else {
      const status=(meetUrl && inviteKimkim) ? 'progress' : (document.getElementById('view-createMeeting').dataset.status||'processing');
      const id=await MeetingService.createMeeting({title,date,time,participants,meetUrl,description,status,inviteKimkim});
      openMeeting(id);
      if(meetUrl && inviteKimkim){
        startMeetBotJob(meetUrl, title, id);
      }
    }
  }catch(err){ document.getElementById('cmError').textContent=err.message; }
}
async function deleteMeetingHandler(id){
  if(!id) return;
  if(!await confirmAction(t('confirmDeleteMeeting'))) return;
  try{ await MeetingService.deleteMeeting(id); showView('meetings',document.querySelector('[data-view=meetings]')); }
  catch(err){ notify(err.message); }
}
let mdChatUnsub=null, mdJobsUnsub=null;
function openMeeting(id){
  currentMeetingId=id;
  currentMeetingObj = meetings.find(x=>x.id===id) || null;
  currentSummaryData=null;
  segments = (currentMeetingObj && currentMeetingObj.transcript && currentMeetingObj.transcript.length) ? [...currentMeetingObj.transcript] : [];
  const jobsEl=document.getElementById('mdGenerationJobs');
  if (jobsEl) jobsEl.textContent = '';
  meetingSummaryTranslated=false;
  showView('meetingDetail');
  showMeetingTab('transcript');
  renderMeetingDetail();

  // Always refresh latest authoritative doc from Firestore
  MeetingService.getMeeting(id).then(m=>{
    if(m && currentMeetingId===id){
      currentMeetingObj=m;
      if (!isMeetingRecording && m.transcript && m.transcript.length) {
        segments = [...m.transcript];
      }
      renderMeetingDetail();
    }
  }).catch(e => console.warn("getMeeting refresh warning:", e));
  if(mdChatUnsub) mdChatUnsub();
  if(mdJobsUnsub) mdJobsUnsub();
  const chatBody = document.getElementById('mdChatBody');
  if (chatBody) chatBody.innerHTML='';

  function renderChatRows(rows) {
    const body = document.getElementById('mdChatBody');
    if (!body) return;
    body.innerHTML = '';
    (rows || []).forEach(m => {
      const cls = m.role === 'user' ? 'user' : 'agent';
      const content = cls === 'agent' ? formatMarkdownToHtml(m.text || '') : escapeHtml(m.text || '');
      body.insertAdjacentHTML('beforeend', `<div class="bubble ${cls}">${content}</div>`);
    });
    body.scrollTop = body.scrollHeight;
  }

  // Render cached chatHistory if available on meeting object
  if (currentMeetingObj && currentMeetingObj.chatHistory && currentMeetingObj.chatHistory.length) {
    renderChatRows(currentMeetingObj.chatHistory);
  }

  mdChatUnsub = AiService.watchMeetingChat(id, rows => {
    if (currentMeetingId !== id) return;
    if (rows && rows.length) {
      renderChatRows(rows);
    } else if (currentMeetingObj && currentMeetingObj.chatHistory && currentMeetingObj.chatHistory.length) {
      renderChatRows(currentMeetingObj.chatHistory);
    }
  });

  mdJobsUnsub = AiService.watchGenerationJobs(id, rows=>{
    const el=document.getElementById('mdGenerationJobs');
    if(!el) return;
    el.innerHTML = rows.length ? rows.map(j=>`<div>• ${j.kind} — ${j.status==='queued'?t('genQueued'):j.status} ${j.status==='queued'?`<span style="opacity:.7">${t('genComingSoon')}</span>`:''}</div>`).join('') : '';
  });
}
function showMeetingTab(which){
  document.getElementById('mdTabTranscriptBtn').classList.toggle('active', which==='transcript');
  document.getElementById('mdTabChatBtn').classList.toggle('active', which==='chat');
  document.getElementById('mdTranscriptPane').classList.toggle('hidden', which!=='transcript');
  document.getElementById('mdChatPane').classList.toggle('hidden', which!=='chat');
}
async function sendMeetingChatMsg(){
  const input = document.getElementById('mdChatInput');
  const text = input ? input.value.trim() : '';
  if (!text || !currentMeetingId) return;
  const body = document.getElementById('mdChatBody');
  if (!body) return;

  // Render user bubble immediately
  body.insertAdjacentHTML('beforeend', `<div class="bubble user">${escapeHtml(text)}</div>`);
  input.value = '';

  // Temporary thinking indicator
  const thinkingId = 'thinking_' + Date.now();
  body.insertAdjacentHTML('beforeend', `<div class="bubble agent" id="${thinkingId}" style="opacity:0.7;font-style:italic;">⏳ Adolf KimKim đang suy nghĩ...</div>`);
  body.scrollTop = body.scrollHeight;

  // Initialize chatHistory array on currentMeetingObj
  if (!currentMeetingObj) {
    currentMeetingObj = meetings.find(m => m.id === currentMeetingId) || { id: currentMeetingId };
  }
  if (!Array.isArray(currentMeetingObj.chatHistory)) {
    currentMeetingObj.chatHistory = [];
  }
  currentMeetingObj.chatHistory.push({ role: 'user', text });

  // Persist user message to Firestore subcollection in background
  if (AiService.addMeetingChatMessage) {
    AiService.addMeetingChatMessage(currentMeetingId, 'user', text).catch(e => console.warn("addMeetingChatMessage user error:", e));
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, transcript: segments })
    });
    const data = await res.json();
    const reply = data.status === 'ok' ? data.reply : (data.message || 'Xin lỗi, không có phản hồi.');

    // Remove thinking indicator
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();

    // Render agent reply
    body.insertAdjacentHTML('beforeend', `<div class="bubble agent">${formatMarkdownToHtml(reply)}</div>`);
    body.scrollTop = body.scrollHeight;

    // Update local chatHistory
    currentMeetingObj.chatHistory.push({ role: 'agent', text: reply });

    // Persist agent message to Firestore subcollection
    if (AiService.addMeetingChatMessage) {
      AiService.addMeetingChatMessage(currentMeetingId, 'agent', reply).catch(e => console.warn("addMeetingChatMessage agent error:", e));
    }

    // Persist full chatHistory to meeting document in Firestore
    MeetingService.updateMeeting(currentMeetingId, {
      chatHistory: currentMeetingObj.chatHistory
    }).catch(e => console.warn("MeetingService.updateMeeting chatHistory error:", e));

  } catch (err) {
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();
    body.insertAdjacentHTML('beforeend', `<div class="bubble agent" style="color:var(--red);">Lỗi kết nối tới AI backend (${err.message}).</div>`);
    body.scrollTop = body.scrollHeight;
  }
}
async function requestGenerationHandler(kind){
  if(!currentMeetingId) return;
  const m=currentMeetingObj;
  const sd=currentSummaryData;
  const title=(sd&&sd.title)||(m&&m.title)||'Meeting';
  const keyPoints=(sd&&sd.key_points)||(m&&m.keyPoints)||[];
  const summary=(sd&&sd.summary)||(m&&m.summary)||'';
  const jobsEl=document.getElementById('mdGenerationJobs');

  if(kind==='mindmap'){
    if(jobsEl) jobsEl.textContent='⏳ Đang tạo sơ đồ tư duy...';
    try{
      const res=await apiFetch(`${getApiUrl()}/api/mindmap/preview`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({transcript:(segments.length?segments:(m&&m.transcript)||[])})});
      const html=await res.text();
      const win=window.open('','_blank'); win.document.write(html); win.document.close();
      if(jobsEl) jobsEl.textContent='✅ Sơ đồ tư duy đã mở trong tab mới.';
    }catch(err){ if(jobsEl) jobsEl.textContent='❌ Lỗi: '+err.message; }

  }else if(kind==='slides'){
    if(!summary){ notify('Vui lòng tóm tắt cuộc họp trước.'); return; }
    if(jobsEl) jobsEl.textContent='⏳ Đang tạo PowerPoint...';
    try{
      const res=await apiFetch(`${getApiUrl()}/api/powerpoint`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title,key_points:keyPoints,summary})});
      const blob=await res.blob();
      const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:title.slice(0,40)+'.pptx'});
      a.click(); URL.revokeObjectURL(a.href);
      if(jobsEl) jobsEl.textContent='✅ PowerPoint đã tải xuống.';
    }catch(err){ if(jobsEl) jobsEl.textContent='❌ Lỗi: '+err.message; }

  }else if(kind==='image'){
    if(!summary){ notify('Vui lòng tóm tắt cuộc họp trước.'); return; }
    if(jobsEl) jobsEl.textContent='⏳ Đang tạo hình ảnh...';
    try{
      const res=await apiFetch(`${getApiUrl()}/api/visualization`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title,key_points:keyPoints,summary})});
      const blob=await res.blob();
      const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:title.slice(0,40)+'.png'});
      a.click(); URL.revokeObjectURL(a.href);
      if(jobsEl) jobsEl.textContent='✅ Hình ảnh đã tải xuống.';
    }catch(err){ if(jobsEl) jobsEl.textContent='❌ Lỗi: '+err.message; }
  }
}
let meetingSummaryTranslated=false;
async function toggleMeetingSummaryTranslation(){
  const el=document.getElementById('mdSummary');
  const btn=document.getElementById('mdTranslateBtn');
  const m=currentMeetingObj;
  if(!el||!m) return;
  if(!meetingSummaryTranslated){
    btn.textContent=t('translating');
    el.textContent = await TranslationService.translateText(m.summary || I18N[lang].aiProcessing, 'en');
    btn.textContent=t('translateBtnBack');
    meetingSummaryTranslated=true;
  } else {
    el.textContent = m.summary ? m.summary : I18N[lang].aiProcessing;
    btn.textContent=t('translateBtn');
    meetingSummaryTranslated=false;
  }
}
function extractActionItems(summary) {
  if (!summary) return [];
  const match = summary.match(/## Action Items\s*\n([\s\S]*?)(?:\n##|$)/i);
  if (!match) return [];
  return match[1].split('\n')
    .map(l => l.replace(/^[\d+.\-*]\s*/, '').trim())
    .filter(l => l && !l.toLowerCase().includes('none explicitly stated') && !l.startsWith('#'));
}

function renderMeetingDetail(){
  const m=currentMeetingObj;
  const titleEl = document.querySelector('#view-meetingDetail .view-title');
  if (titleEl) titleEl.textContent = m ? m.title : '';
  const subEl = document.querySelector('#view-meetingDetail .view-sub');
  if (subEl) subEl.textContent = m ? [m.date,m.time,m.dur].filter(Boolean).join(' · ') : '';
  if (!isMeetingRecording) {
    segments = (m && m.transcript && m.transcript.length) ? [...m.transcript] : [];
  }

  const partEl=document.getElementById('mdParticipants');
  if(partEl){
    const list=(m && m.participants) || [];
    partEl.innerHTML = list.length ? list.map(p=>`<span class="tag">${escapeHtml(p)}</span>`).join('') :
      `<div style="color:var(--text-2);font-size:12px;">${I18N[lang].noParticipants}</div>`;
  }
  const kpEl=document.getElementById('mdKeyPoints');
  if(kpEl){
    const kp=(m && m.keyPoints) || [];
    kpEl.innerHTML = kp.length ? kp.map(k=>`<span class="tag">${escapeHtml(k)}</span>`).join('') :
      `<div style="color:var(--text-2);font-size:12px;">${I18N[lang].aiProcessing}</div>`;
  }
  const sumEl=document.getElementById('mdSummary');
  if(sumEl) {
    sumEl.innerHTML = (m && m.summary) ? formatMarkdownToHtml(m.summary) : I18N[lang].aiProcessing;
  }
  const aiEl=document.getElementById('mdActionItems');
  if(aiEl){
    let items=(m && m.actionItems) || [];
    if ((!items || items.length === 0) && m && m.summary) {
      items = extractActionItems(m.summary);
    }
    aiEl.innerHTML = items.length ? '<ul style="margin:0;padding-left:18px;">'+items.map(i=>`<li style="font-size:13px;">${escapeHtml(i)}</li>`).join('')+'</ul>' :
      `<div style="color:var(--text-2);font-size:12px;">${I18N[lang].aiProcessing}</div>`;
  }
  const notesInput=document.getElementById('mdNotesInput');
  if(notesInput) notesInput.value = (m && m.notes) || '';
  const barEl=document.getElementById('mdMeetBotBar');
  if(barEl) barEl.classList.toggle('hidden', !(activeMeetBot && (!activeMeetBot.meetingId || activeMeetBot.meetingId===currentMeetingId)));
  renderTranscriptAndStats();
}
function saveMeetingNotes(){
  if(!currentMeetingId) return;
  const val=document.getElementById('mdNotesInput').value;
  MeetingService.updateMeeting(currentMeetingId, {notes:val}).catch(err=>notify(err.message));
}
function filterMeetings(status,btn){
  activeMeetingFilter=status;
  document.querySelectorAll('.filters button').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderMeetingsTable();
}
function onGlobalSearch(v){
  searchQuery=(v||'').toLowerCase();
  renderMeetingsTable();
  renderAll();
}
function visibleMeetings(){
  return meetings
    .filter(m=>activeMeetingFilter==='all' || m.status===activeMeetingFilter)
    .filter(m=>!searchQuery || (m.title||'').toLowerCase().includes(searchQuery));
}

/* ---- Notes ---- */
function createNote(){
  showView('notes',document.querySelector('[data-view=notes]'));
  document.getElementById('noteComposer').classList.remove('hidden');
  document.getElementById('newNoteTitle').focus();
}
function cancelNewNote(){
  const form=document.getElementById('noteComposer');form.reset();delete form.dataset.pendingId;form.classList.add('hidden');
  document.getElementById('newNoteError').textContent='';
  document.querySelector('#view-notes [onclick="createNote()"]')?.focus();
}
async function submitNewNote(event){
  event.preventDefault();
  const title=document.getElementById('newNoteTitle').value.trim();
  const content=document.getElementById('newNoteContent').value;
  const error=document.getElementById('newNoteError'),button=document.getElementById('newNoteSubmit');
  if(!title){error.textContent=t('uiNoteTitleRequired');document.getElementById('newNoteTitle').focus();return;}
  error.textContent='';button.disabled=true;
  document.querySelector('#noteComposer [type=button]').disabled=true;
  try{
    // Keep an already-created id for retry if saving the body fails.
    const form=document.getElementById('noteComposer');
    const id=form.dataset.pendingId || await NoteService.createNote(title);
    if(!id) throw new Error(t('uiNoteSaveFailed'));
    form.dataset.pendingId=id;
    await NoteService.updateNote(id,{title,content});
    currentNoteId=id;
    const index=notesArr.findIndex(n=>n.id===id);
    if(index<0) notesArr.unshift({id,title,content});else Object.assign(notesArr[index],{title,content});
    delete form.dataset.pendingId;
    cancelNewNote();openNote(id);notify(t('uiNoteSaved'));
  }catch(err){error.textContent=err.message;}
  finally{button.disabled=false;document.querySelector('#noteComposer [type=button]').disabled=false;}
}

function openNote(id){ currentNoteId=id; noteTranslated=false; renderAll(); }
let noteTranslated=false;
async function toggleNoteTranslation(){
  const editor=document.querySelector('#view-notes .editor');
  const p=editor && editor.querySelector('p');
  const btn=document.getElementById('noteTranslateBtn');
  if(!p) return;
  const note=notesArr.find(n=>n.id===currentNoteId);
  if(!note) return;
  if(!noteTranslated){
    btn.textContent=t('translating');
    const translated=await TranslationService.translateText(note.content||'', 'en');
    p.textContent=translated;
    btn.textContent=t('translateBtnBack');
    noteTranslated=true;
  } else {
    p.textContent=note.content||'';
    btn.textContent=t('translateBtn');
    noteTranslated=false;
  }
}
function saveCurrentNote(){
  if(!currentNoteId) return;
  const editor=document.querySelector('#view-notes .editor');
  const h1=editor.querySelector('h1'); const p=editor.querySelector('p');
  const status=document.getElementById('noteSaveStatus');
  if(status) status.textContent=t('uiSaving');
  NoteService.updateNote(currentNoteId, { title: h1 ? h1.textContent : '', content: p ? p.textContent : '' })
    .then(()=>{if(status) status.textContent=t('savedMsg');})
    .catch(err=>{if(status) status.textContent=err.message;});
}
async function deleteNoteHandler(){
  if(!currentNoteId) return;
  if(!await confirmAction(t('confirmDeleteNote'))) return;
  try{
    await NoteService.deleteNote(currentNoteId);
    currentNoteId = notesArr.find(n=>n.id!==currentNoteId) ? notesArr.find(n=>n.id!==currentNoteId).id : null;
  }catch(err){ notify(err.message); }
}

/* ---- Team ---- */
function openInviteMemberModal(){
  document.getElementById('inviteMemberEmail').value='';
  document.getElementById('inviteMemberError').textContent='';
  document.getElementById('inviteMemberModal').classList.remove('hidden');
}
function closeInviteMemberModal(){
  document.getElementById('inviteMemberModal').classList.add('hidden');
}
async function submitInviteMember(){
  const email=document.getElementById('inviteMemberEmail').value.trim();
  const errEl=document.getElementById('inviteMemberError');
  if(!email){ errEl.textContent=t('promptInviteEmail'); return; }
  try{
    await TeamService.inviteMember(email);
    closeInviteMemberModal();
    notify(t('inviteSentMsg'));
  }catch(err){ errEl.textContent=err.message; }
}
async function inviteMember(){ openInviteMemberModal(); }
async function removeMemberHandler(id){
  if(!await confirmAction(t('confirmRemoveMember'))) return;
  try{ await TeamService.removeMember(id); } catch(err){ notify(err.message); }
}
async function changeRoleHandler(id,role){
  try{ await TeamService.changeRole(id,role); } catch(err){ notify(err.message); }
}

/* ---- Uploads (uploadApi abstraction — mock adapter today, real REST later) ---- */
function selectUploadFile(){
  document.getElementById('hiddenFileInput').click();
}
async function addProcessedMeeting(title, transcript, durSeconds) {
  const now = new Date();
  const durFormatted = durSeconds ? fmt(durSeconds) : '00:30';
  const meetingData = {
    title: title || 'Cuộc họp ' + now.toLocaleString('vi-VN'),
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    dur: durFormatted,
    status: 'done',
    transcript: transcript || [],
    summary: '',
    keyPoints: [],
    actionItems: [],
    notes: '',
    participants: []
  };

  let meetingId = 'm_' + Date.now();
  try {
    const remoteId = await MeetingService.createMeeting(meetingData);
    if (remoteId) meetingId = remoteId;
  } catch (err) {
    console.warn("MeetingService.createMeeting warning:", err.message);
  }

  meetingData.id = meetingId;
  const existingIdx = meetings.findIndex(m => m.id === meetingId);
  if (existingIdx >= 0) meetings[existingIdx] = meetingData;
  else meetings.unshift(meetingData);

  renderAll();
  showView('meetings', document.querySelector('[data-view=meetings]'));
  openMeeting(meetingId);
  return meetingId;
}

async function handleFileSelected(fileOrInput){
  const file = (fileOrInput instanceof File) ? fileOrInput : (fileOrInput && fileOrInput.files ? fileOrInput.files[0] : fileOrInput);
  if(!file) return;

  const isAudioVideo = (file.type && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) ||
                       /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|mov|mkv)$/i.test(file.name);
  if(!isAudioVideo){
    notify('Chỉ hỗ trợ file âm thanh hoặc video (mp3, wav, mp4, webm, ogg, m4a...).');
    return;
  }

  const upEl = document.getElementById('uploadList');
  const row = document.createElement('div');
  row.style.cssText = 'padding:10px 12px;font-size:13px;color:var(--text-1);border-bottom:1px solid var(--border);';
  row.textContent = '⏳ Đang phân tích file: ' + file.name;
  if(upEl) upEl.prepend(row);

  try{
    const transcript = await transcribeAudioBlob(file, msg => {
      row.textContent = msg + ' — ' + file.name;
    });
    const meetingTitle = file.name.replace(/\.[^.]+$/, '') || 'Tệp tải lên';
    const durEst = (transcript && transcript.length) ? (transcript[transcript.length - 1].t + 5) : 30;
    await addProcessedMeeting(meetingTitle, transcript, durEst);
    row.textContent = '✅ ' + file.name + ' — Đã xử lý và tạo cuộc họp thành công';
  }catch(err){
    console.error("Upload error:", err);
    row.textContent = '❌ ' + file.name + ': ' + err.message;
  }
}

async function audioBufferTo16kPcm(audioBuffer) {
  const targetSampleRate = 16000;
  let pcmData;
  if (audioBuffer.sampleRate === targetSampleRate) {
    pcmData = audioBuffer.getChannelData(0);
  } else {
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
      1,
      Math.ceil(audioBuffer.duration * targetSampleRate),
      targetSampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const renderedBuffer = await offlineCtx.startRendering();
    pcmData = renderedBuffer.getChannelData(0);
  }
  const pcm = new Int16Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm;
}

async function transcribeAudioBlob(blob, onProgress) {
  if (onProgress) onProgress("Đang gửi âm thanh lên máy chủ...");
  const formData = new FormData();
  formData.append("file", blob, blob.name || "recording.wav");

  const apiUrl = getApiUrl();
  const resp = await apiFetch(apiUrl + "/api/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Phiên âm thất bại (${resp.status}): ${errText}`);
  }

  const result = await resp.json();
  if (result.status === "error") {
    throw new Error(result.message || "Lỗi phiên âm");
  }

  const rawSegments = result.segments || [];
  const collectedSegments = rawSegments.map(s => {
    const spk = mapSpeakerName(s.speaker || "Sally");
    return {
      t: Math.floor(s.start || 0),
      speaker: spk,
      color: getSpeakerColor(spk),
      text: (s.text || "").trim(),
    };
  });

  if (onProgress) onProgress(`Đã nhận ${collectedSegments.length} câu`);
  return collectedSegments;
}

// Override saveRecording to transcribe and create a meeting
window.saveRecording = async function() {
  const blob = RecordingService.getLastBlob();
  if (!blob) return;
  const saveBtn = document.getElementById('recSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Đang phiên âm...';
  }
  try {
    const transcript = await transcribeAudioBlob(blob, (msg) => {
      if (saveBtn) saveBtn.textContent = msg;
    });
    const now = new Date();
    const durSec = (transcript && transcript.length) ? (transcript[transcript.length - 1].t + 5) : 30;
    await addProcessedMeeting('Ghi âm ' + now.toLocaleString('vi-VN'), transcript, durSec);
    RecordingService.cancelRecording();
  } catch (err) {
    console.error("Recording transcription error:", err);
    notify('Lỗi phiên âm: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu thành cuộc họp';
    }
  }
};

function statusBadge(s){
  const map={progress:['statusInProgress','blue'],processing:['statusProcessing','amber'],done:['statusDone','green'],pending:['statusPending','amber'],active:['statusActive','green'],error:['statusError','red']};
  const entry = map[s] || map['processing'];
  const [k,c]=entry;
  return `<span class="badge ${c}">${I18N[lang][k]||s}</span>`;
}
function initials(n){return (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();}

function renderMeetingsTable(){
  const el=document.getElementById('meetingsTable');
  if(!el) return;
  if(meetingsState==='loading'){ el.innerHTML = `<tr><td colspan="5" style="color:var(--text-2)">${I18N[lang].loadingMeetings}</td></tr>`; return; }
  if(meetingsState==='error'){ el.innerHTML = `<tr><td colspan="5" style="color:var(--red)">${I18N[lang].errorMeetings}</td></tr>`; return; }
  const rows=visibleMeetings();
  el.innerHTML = rows.map(m=>`
    <tr style="cursor:pointer" onclick="openMeeting('${m.id}')">
      <td>${m.title}</td><td>${m.date||''}</td><td>${m.dur||''}</td><td>${statusBadge(m.status)}</td>
      <td style="text-align:right;color:var(--text-2)">→</td>
    </tr>`).join('') || `<tr><td colspan="5" style="color:var(--text-2)">${I18N[lang].noMeetings}</td></tr>`;
}

function renderAll(){
  // upcoming (home)
  const upcomingEl=document.getElementById('upcomingList');
  if(upcomingEl) upcomingEl.innerHTML = meetings.slice(0,3).map(m=>`
    <div class="list-row" onclick="openMeeting('${m.id}')">
      <div class="avatar" style="background:#3b82f6">${initials(m.title)}</div>
      <div class="info"><div class="t">${m.title}</div><div class="d">${m.date||''} · ${m.dur||''}</div></div>
      ${statusBadge(m.status)}
    </div>`).join('') || `<div style="color:var(--text-2);font-size:13px;">${I18N[lang].noMeetings}</div>`;
  // recent notes
  const recentEl=document.getElementById('recentNotesList');
  if(recentEl) recentEl.innerHTML = notesArr.slice(0,3).map(n=>`
    <div class="list-row" onclick="showView('notes',document.querySelector('[data-view=notes]'));openNote('${n.id}')">
      <div class="avatar" style="background:#22c55e">📝</div>
      <div class="info"><div class="t">${n.title}</div></div>
    </div>`).join('') || `<div style="color:var(--text-2);font-size:13px;">${I18N[lang].noNotes}</div>`;
  // meetings table
  renderMeetingsTable();
  // notes sidebar + editor
  const sideEl=document.getElementById('notesSidebarList');
  if(sideEl) sideEl.innerHTML = notesArr.map(n=>`
    <div class="list-row" style="cursor:pointer;${n.id===currentNoteId?'background:var(--accent-soft)':''}" onclick="openNote('${n.id}')">
      <div class="info"><div class="t" style="font-size:12px">${n.title}</div></div>
    </div>`).join('') || `<div style="color:var(--text-2);font-size:13px;padding:8px;">${I18N[lang].noNotes}</div>`;
  const curNote=notesArr.find(n=>n.id===currentNoteId);
  const editor=document.querySelector('#view-notes .editor');
  document.getElementById('noteEmptyState')?.classList.toggle('hidden',!!curNote);
  if(editor) editor.classList.toggle('hidden',!curNote);
  document.querySelectorAll('#view-notes .notes-workspace .btn').forEach(button=>button.disabled=!curNote);
  if(editor && !editor.contains(document.activeElement)){
    const h1=editor.querySelector('h1'); const p=editor.querySelector('p');
    if(curNote){ if(h1)h1.textContent=curNote.title||''; if(p)p.textContent=curNote.content||''; }
    else { if(h1)h1.textContent=''; if(p)p.textContent=''; }
  }
  // team table
  const teamEl=document.getElementById('teamTable');
  if(teamEl) teamEl.innerHTML = teamArr.map(t=>`
    <tr><td style="display:flex;align-items:center;gap:9px;"><div class="avatar" style="background:${t.color||'#3b82f6'}">${initials(t.name)}</div>${t.name}</td>
    <td>${t.email}</td><td>${statusBadge(t.status)}</td>
    <td><select onchange="changeRoleHandler('${t.id}',this.value)"><option value="member" ${t.role==='member'?'selected':''}>Member</option><option value="admin" ${t.role==='admin'?'selected':''}>Admin</option></select></td>
    <td><button class="btn btn-ghost" style="border-color:var(--red);color:var(--red);padding:4px 10px;" onclick="removeMemberHandler('${t.id}')">✕</button></td></tr>`).join('') || `<tr><td colspan="5" style="color:var(--text-2)">${I18N[lang].noTeam}</td></tr>`;
  // uploads
  const upEl=document.getElementById('uploadList');
  if(upEl) upEl.innerHTML = uploadsArr.map(u=>`
    <div class="upload-row"><div style="font-size:18px;">${u.status==='error'?'⚠️':'🎬'}</div>
      <div style="flex:1;"><div style="font-size:13px;">${u.name}</div>
        <div class="prog"><i style="width:${u.progressPct||0}%;${u.status==='error'?'background:var(--red)':''}"></i></div>
        ${u.status==='error' ? `<div style="font-size:11px;color:var(--red);">${u.errorMessage||I18N[lang].uploadFailed}</div>` : ''}</div>
      <div style="font-size:12px;color:var(--text-2)">${u.status==='done'?I18N[lang].uploadDone:(u.status==='error'?I18N[lang].uploadFailed:(u.progressPct||0)+'%')}</div></div>`).join('')
    || `<div style="color:var(--text-2);font-size:13px;padding:8px;">${I18N[lang].noUploads}</div>`;
  renderTranscriptAndStats();
}
function renderTranscriptAndStats(){
  const segEl=document.getElementById('segList');
  if(segEl) {
    let html = segments.map(s=>`
      <div class="seg" onclick="highlightSeg(this)">
        <div class="meta"><span class="dot" style="background:${s.color}"></span><b>${escapeHtml(s.speaker)}</b>
        <span class="time">${fmt(s.t)}</span></div><p>${escapeHtml(s.text)}</p></div>`).join('');
    if (livePartialText) {
      html += `
        <div class="seg partial">
          <div class="meta"><span class="live-dot"></span><b>${escapeHtml(livePartialSpeaker || "Sally")} (đang nói...)</b></div>
          <p style="color:var(--text-0);font-style:italic;">${escapeHtml(livePartialText)}</p>
        </div>`;
    }
    segEl.innerHTML = html || `<div style="color:var(--text-2);font-size:13px;">${I18N[lang].aiProcessing}</div>`;
    segEl.scrollTop = segEl.scrollHeight;
  }
  const totals={}; segments.forEach(s=>totals[s.speaker]=(totals[s.speaker]||0)+1);
  const max=Math.max(1,...Object.values(totals));
  const statEl=document.getElementById('speakerStats');
  if(statEl) statEl.innerHTML = Object.entries(totals).map(([name,c])=>{
    const sp = segments.find(s=>s.speaker===name);
    return `<div class="sp-row"><span style="width:50px">${name}</span><div class="sp-bar"><i style="width:${(c/max)*100}%;background:${sp ? sp.color : '#00d4ff'}"></i></div></div>`;
  }).join('') || (statEl ? `<div style="color:var(--text-2);font-size:12px;">${I18N[lang].aiProcessing}</div>` : '');
}
function fmt(s){const m=Math.floor(s/60),sec=s%60;return `${m}:${sec.toString().padStart(2,'0')}`;}
function highlightSeg(el){document.querySelectorAll('.seg').forEach(s=>s.style.background='');el.style.background='var(--accent-soft)';}

/* ---------------- Global AI Chatbot (Adolf KimKim) ---------------- */
function toggleChat(){
  document.getElementById('chatPanel')?.classList.toggle('open');
}

let chatUnsub = null;
let globalChatHistoryCache = [];
let isGlobalChatGenerating = false;

function renderGlobalChat() {
  const body = document.getElementById('chatBody');
  if (!body) return;
  body.innerHTML = '';

  // Always display greeting
  const greetingText = (typeof I18N !== 'undefined' && I18N[lang] && I18N[lang].greeting)
    ? I18N[lang].greeting
    : 'Chào bạn 👋 Tôi là KimKim. Hỏi tôi những gì bạn muốn.';
  body.insertAdjacentHTML('beforeend', `<div class="bubble agent">${escapeHtml(greetingText)}</div>`);

  // Render chronological chat history with markdown
  globalChatHistoryCache.forEach(m => {
    const cls = (m.role === 'user') ? 'user' : 'agent';
    const content = (cls === 'agent') ? formatMarkdownToHtml(m.text || '') : escapeHtml(m.text || '');
    body.insertAdjacentHTML('beforeend', `<div class="bubble ${cls}">${content}</div>`);
  });
  body.scrollTop = body.scrollHeight;
}

function loadChatHistory(){
  if (chatUnsub) {
    try { chatUnsub(); } catch(e){}
    chatUnsub = null;
  }
  chatUnsub = AiService.watchChatHistory(rows => {
    // If a request is actively streaming or thinking, skip snapshot overwriting DOM
    if (isGlobalChatGenerating) return;
    if (rows && rows.length > 0) {
      globalChatHistoryCache = rows;
      renderGlobalChat();
    } else if (globalChatHistoryCache.length === 0) {
      renderGlobalChat();
    }
  });
}

async function sendChat(){
  const input = document.getElementById('chatInput');
  const text = input ? input.value.trim() : '';
  if (!text || isGlobalChatGenerating) return;
  const body = document.getElementById('chatBody');
  if (!body) return;

  isGlobalChatGenerating = true;

  // 1. Optimistic user bubble
  body.insertAdjacentHTML('beforeend', `<div class="bubble user">${escapeHtml(text)}</div>`);
  input.value = '';

  // 2. Build conversational history context (take up to last 20 messages BEFORE this new turn)
  const historyPayload = globalChatHistoryCache.slice(-20).map(m => ({
    role: (m.role === 'user') ? 'user' : 'assistant',
    content: m.text || ''
  }));

  // Immediately append user message to local cache so conversational memory is continuous
  globalChatHistoryCache.push({ role: 'user', text: text });

  // 3. Thinking indicator
  const thinkingId = 'global_thinking_' + Date.now();
  body.insertAdjacentHTML('beforeend', `<div class="bubble agent" id="${thinkingId}" style="opacity:0.7;font-style:italic;">⏳ Adolf KimKim đang suy nghĩ...</div>`);
  body.scrollTop = body.scrollHeight;

  // 4. Persist user message to Firestore asynchronously
  AiService.addChatMessage('user', text).catch(err => console.warn("addChatMessage user error:", err));

  // 5. Call backend global-chat endpoint with historyPayload
  try {
    const res = await apiFetch(`${getApiUrl()}/api/global-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: historyPayload })
    });
    const data = await res.json();
    const reply = data.status === 'ok' ? data.reply : (data.message || 'Xin lỗi, không có phản hồi.');

    // Remove thinking indicator
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();

    // Immediately append agent reply to local cache
    globalChatHistoryCache.push({ role: 'agent', text: reply });

    // Render agent reply
    body.insertAdjacentHTML('beforeend', `<div class="bubble agent">${formatMarkdownToHtml(reply)}</div>`);
    body.scrollTop = body.scrollHeight;

    // 6. Persist agent reply to Firestore asynchronously
    AiService.addChatMessage('agent', reply).catch(err => console.warn("addChatMessage agent error:", err));
  } catch (err) {
    const thinkingEl = document.getElementById(thinkingId);
    if (thinkingEl) thinkingEl.remove();
    body.insertAdjacentHTML('beforeend', `<div class="bubble agent" style="color:var(--red);">Lỗi kết nối tới Adolf KimKim (${err.message}).</div>`);
    body.scrollTop = body.scrollHeight;
  } finally {
    isGlobalChatGenerating = false;
  }
}

async function clearGlobalChatHistory(){
  const msg = lang === 'vi' ? 'Bạn có chắc muốn xoá toàn bộ lịch sử trò chuyện?' : 'Are you sure you want to clear chat history?';
  if (!await confirmAction(msg)) return;
  try {
    await AiService.clearChatHistory();
    globalChatHistoryCache = [];
    renderGlobalChat();
  } catch (err) {
    notify("Lỗi khi xoá lịch sử: " + err.message);
  }
}
document.getElementById('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
['signinEmail','signinPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter')signInWithEmail();});});
['signupName','signupEmail','signupPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter')signUpWithEmail();});});

/* ---------------- Plan / Payment ----------------
   No real payment gateway available: the "Pay" button in the Upgrade
   screen is disabled and marked "Coming soon" in the HTML. This app
   never sets plan='pro' from the client. */


/* ============================================================
   SPEECH AI & REAL-TIME STT ENGINE INTEGRATION
   (Preserved & Modularized Backend AI Integration)
   ============================================================ */

const SPEAKER_NAMES = ["Sally", "Miles", "Curtis", "Sean"];
const SPEAKER_COLORS = {
  "Sally": "#3b82f6",
  "Miles": "#f59e0b",
  "Curtis": "#22c55e",
  "Sean": "#ef4444"
};

function mapSpeakerName(spk) {
  if (!spk) return "Sally";
  if (SPEAKER_COLORS[spk]) return spk;
  const num = parseInt(spk.replace(/\D/g, ''), 10);
  if (!isNaN(num) && num < SPEAKER_NAMES.length) return SPEAKER_NAMES[num];
  return spk;
}
function getSpeakerColor(name) {
  if (SPEAKER_COLORS[name]) return SPEAKER_COLORS[name];
  const palette = ["#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#a855f7", "#06b6d4", "#ec4899"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return palette[Math.abs(hash) % palette.length];
}

// Stable deployment endpoints. Runtime configuration never contains API secrets.
function storedEndpoint(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function getDefaultApiUrl() {
  return (window.AKK_CONFIG?.apiBaseUrl || window.location.origin).replace(/\/$/, '');
}
function getDefaultSttUrl() {
  return window.AKK_CONFIG?.sttUrl ||
    window.location.origin.replace(/^http/, 'ws') + '/v1/ws/realtime-speech';
}
function getSttUrl() {
  return storedEndpoint('stt_url') || getDefaultSttUrl();
}
function getApiUrl() {
  return (storedEndpoint('api_url') || getDefaultApiUrl()).replace(/\/$/, '');
}
// Firebase credentials are sent only to the configured backend, never persisted.
async function apiFetch(url, options = {}) {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error(lang === 'vi' ? 'Vui lòng đăng nhập.' : 'Please sign in.');
  const target = new URL(url, window.location.href);
  if (target.origin !== new URL(getApiUrl()).origin) throw new Error('Unexpected API origin');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  const response = await fetch(target.href, {...options, headers});
  if (!response.ok) {
    const data = await response.clone().json().catch(() => ({}));
    throw new Error(data.detail || `API error (${response.status})`);
  }
  return response;
}

function getMeetingLang() {
  return document.getElementById('settingMeetLang')?.value || "vi";
}

function formatMarkdownToHtml(md) {
  if (!md) return "";
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*?)\*/gim, '<i>$1</i>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
    .replace(/\n\n/gim, '<br><br>');
}

/* ---------------- STT Engine ---------------- */
async function startMeetingRecording() {
  if (isMeetingRecording) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(micStream);
    processor = audioCtx.createScriptProcessor(1024, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isMeetingRecording || !sttWs || sttWs.readyState !== 1) return;
      const raw = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        const s = Math.max(-1, Math.min(1, raw[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      sttWs.send(pcm.buffer);
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);

    const wsUrl = getSttUrl();
    sttWs = new WebSocket(wsUrl);
    sttWs.binaryType = "arraybuffer";

    sttWs.onopen = () => {
      isMeetingRecording = true;
      recordingSeconds = 0;
      recordingTimer = setInterval(() => {
        recordingSeconds++;
        const sub = document.getElementById('meetingDetailSub');
        if (sub) sub.textContent = `Đang ghi âm trực tiếp · ${fmt(recordingSeconds)}`;
      }, 1000);

      document.getElementById('btnMicToggle')?.classList.add('recording');
      document.getElementById('recordingStatusBadge')?.classList.remove('hidden');

      const langCode = getMeetingLang();
      sttWs.send(JSON.stringify({
        model: "stt-rt-v3",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        language_hints: [langCode, "en"],
        enable_speaker_diarization: true,
        enable_endpoint_detection: true
      }));
    };

    sttWs.onmessage = (evt) => {
      if (typeof evt.data !== 'string') return;
      try {
        const data = JSON.parse(evt.data);
        handleSTTMessage(data);
      } catch (err) {
        console.error("STT message parse error:", err);
      }
    };

    sttWs.onclose = () => { stopMeetingRecording(); };
    sttWs.onerror = (e) => { console.error("STT WS error:", e); stopMeetingRecording(); };

  } catch (e) {
    console.error("Microphone access error:", e);
    notify("Không thể truy cập microphone: " + e.message);
    stopMeetingRecording();
  }
}

function stopMeetingRecording() {
  isMeetingRecording = false;
  if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
  document.getElementById('btnMicToggle')?.classList.remove('recording');
  document.getElementById('recordingStatusBadge')?.classList.add('hidden');

  if (sttWs) {
    try { sttWs.send(new ArrayBuffer(0)); sttWs.close(); } catch(e){}
    sttWs = null;
  }
  if (processor) { try { processor.disconnect(); } catch(e){} processor = null; }
  if (audioCtx) { try { audioCtx.close(); } catch(e){} audioCtx = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

  livePartialText = "";
  renderTranscript();

  // Auto-persist transcript to Firestore
  if (currentMeetingId && segments && segments.length > 0) {
    const durStr = recordingSeconds ? fmt(recordingSeconds) : (currentMeetingObj?.dur || '00:00');
    MeetingService.updateMeeting(currentMeetingId, {
      transcript: segments,
      dur: durStr
    }).catch(err => console.warn("Failed to auto-save transcript:", err));
    if (currentMeetingObj) {
      currentMeetingObj.transcript = segments;
      currentMeetingObj.dur = durStr;
    }
  }
}

function toggleMeetingMic() {
  if (isMeetingRecording) stopMeetingRecording();
  else startMeetingRecording();
}

function handleSTTMessage(data) {
  if (data.error_code) {
    console.error("STT error:", data.error_message);
    return;
  }

  // Format 1: turn_end / transcript_final (Utterance finished)
  if (data.type === 'turn_end' || data.type === 'transcript_final') {
    const text = (data.text || '').trim();
    if (!text || text === lastFinalText) return;
    lastFinalText = text;
    const spk = mapSpeakerName(data.speaker || data.speaker_id || "Sally");
    segments.push({
      t: recordingSeconds,
      speaker: spk,
      color: getSpeakerColor(spk),
      text: text
    });
    livePartialText = "";
    renderTranscriptAndStats();
    return;
  }

  // Format 2: tokens streaming
  if (data.tokens && Array.isArray(data.tokens)) {
    const hasEnd = data.tokens.some(t => t.text === '<end>');

    if (hasEnd) {
      // Completed turn signaled by <end> sentinel
      const finalText = data.tokens.filter(t => t.text !== '<end>').map(t => t.text).join('').trim();
      if (finalText && finalText !== lastFinalText) {
        lastFinalText = finalText;
        const rawSpk = data.tokens.find(t => t.speaker)?.speaker || data.speaker || "Sally";
        const spk = mapSpeakerName(rawSpk);
        segments.push({
          t: recordingSeconds,
          speaker: spk,
          color: getSpeakerColor(spk),
          text: finalText
        });
      }
      livePartialText = "";
      renderTranscriptAndStats();
      return;
    }

    // Ongoing speech: display all tokens in current turn as interim/live text
    const textTokens = data.tokens.filter(t => t.text !== '<end>');
    const currentText = textTokens.map(t => t.text).join('').trim();
    if (currentText) {
      livePartialText = currentText;
      const rawSpk = textTokens.find(t => t.speaker)?.speaker || data.speaker || "Sally";
      livePartialSpeaker = mapSpeakerName(rawSpk);
      renderTranscriptAndStats();
    }
  }
}

function renderTranscript() {
  renderTranscriptAndStats();
}

/* ---------------- Google Meet Bot Integration ---------------- */
let activeMeetBot = null; // { jobId, meetingId, title, pollTimer }

async function startMeetBotFromRecording() {
  const urlInput = document.getElementById('recMeetUrl');
  const titleInput = document.getElementById('recMeetTitle');
  const meetUrl = (urlInput?.value || '').trim();
  const title = (titleInput?.value || '').trim();

  if (!meetUrl || !meetUrl.includes('meet.google.com/')) {
    notify('Vui lòng nhập link Google Meet hợp lệ (ví dụ: https://meet.google.com/xxx-xxxx-xxx).');
    return;
  }
  await startMeetBotJob(meetUrl, title, null);
}

async function startMeetBotJob(meetUrl, title, existingMeetingId) {
  if (activeMeetBot && activeMeetBot.pollTimer) {
    notify('Hiện đang có một Bot đang chạy. Vui lòng dừng phiên hiện tại trước.');
    return;
  }

  updateMeetBotUI({ active: true, status: 'joining', message: '🚀 Đang khởi động Bot vào Google Meet...', elapsed_sec: 0, participants: [] });

  try {
    const res = await apiFetch(`${getApiUrl()}/api/meet-bot/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meet_url: meetUrl, title: title || '' })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const jobId = data.job_id;

    activeMeetBot = {
      jobId,
      meetingId: existingMeetingId || null,
      title: title || '',
      meetUrl,
      pollTimer: setInterval(() => pollMeetBotStatus(jobId), 2000)
    };
    pollMeetBotStatus(jobId);
  } catch (err) {
    console.error('Failed to start Meet Bot:', err);
    updateMeetBotUI({ active: false, status: 'error', message: '❌ Không thể khởi động Bot: ' + err.message });
    notify('Không thể khởi động KimKim Meeting: ' + err.message);
  }
}

async function stopActiveMeetBot() {
  if (!activeMeetBot || !activeMeetBot.jobId) return;
  const stopBtn1 = document.getElementById('recMeetStopBtn');
  const stopBtn2 = document.getElementById('mdMeetBotStopBtn');
  if (stopBtn1) { stopBtn1.disabled = true; stopBtn1.textContent = '⏳ Đang dừng & xử lý...'; }
  if (stopBtn2) { stopBtn2.disabled = true; stopBtn2.textContent = '⏳ Đang dừng & xử lý...'; }

  try {
    await apiFetch(`${getApiUrl()}/api/meet-bot/stop/${activeMeetBot.jobId}`, { method: 'POST' });
  } catch (err) {
    console.warn('Stop Meet Bot warning:', err);
  }
}

async function pollMeetBotStatus(jobId) {
  if (!activeMeetBot || activeMeetBot.jobId !== jobId) return;
  try {
    const res = await apiFetch(`${getApiUrl()}/api/meet-bot/status/${jobId}`);
    if (!res.ok) return;
    const data = await res.json();

    updateMeetBotUI({
      active: data.status !== 'done' && data.status !== 'error' && data.status !== 'stopped',
      status: data.status,
      message: data.message,
      elapsed_sec: data.elapsed_sec || 0,
      participants: data.participants || []
    });

    // Live-update participants on the Meeting Detail view if open
    if (activeMeetBot.meetingId && currentMeetingId === activeMeetBot.meetingId && data.participants?.length) {
      if (currentMeetingObj) {
        const merged = Array.from(new Set([...(currentMeetingObj.participants || []), ...data.participants]));
        currentMeetingObj.participants = merged;
        const partEl = document.getElementById('mdParticipants');
        if (partEl) {
          partEl.innerHTML = merged.map(p => `<span class="tag">${escapeHtml(p)}</span>`).join('');
        }
      }
    }

    if (data.status === 'error' || data.status === 'stopped') {
      clearInterval(activeMeetBot.pollTimer);
      const errMsg = data.message || 'Bot đã dừng.';
      activeMeetBot = null;
      notify(errMsg);
      return;
    }

    if (data.status === 'done' && data.result) {
      const finishedBot = activeMeetBot;
      clearInterval(finishedBot.pollTimer);
      activeMeetBot = null;
      await finalizeMeetBotResult(finishedBot, data.result);
    }
  } catch (err) {
    console.warn('Poll Meet Bot status error:', err);
  }
}

function updateMeetBotUI({ active, status, message, elapsed_sec = 0, participants = [] }) {
  // 1. Recording view card
  const startBtn = document.getElementById('recMeetStartBtn');
  const stopBtn = document.getElementById('recMeetStopBtn');
  const timerEl = document.getElementById('recMeetTimer');
  const statusEl = document.getElementById('recMeetStatus');
  const partEl = document.getElementById('recMeetParticipants');

  const canStop = active && (status === 'joining' || status === 'waiting_admission' || status === 'recording');
  if (startBtn) startBtn.style.display = active ? 'none' : 'inline-flex';
  if (stopBtn) {
    stopBtn.style.display = active ? 'inline-flex' : 'none';
    stopBtn.disabled = !canStop;
    stopBtn.textContent = canStop ? '⏹ Kết thúc & Tóm tắt AI' : '⏳ Đang phiên âm & tóm tắt...';
  }
  if (timerEl) {
    timerEl.style.display = (active && (status === 'recording' || elapsed_sec > 0)) ? 'block' : 'none';
    timerEl.textContent = fmt(elapsed_sec || 0);
  }
  if (statusEl) statusEl.textContent = message || '';
  if (partEl) {
    partEl.innerHTML = (participants || []).map(p => `<span class="tag">${escapeHtml(p)}</span>`).join('');
  }

  // 2. Meeting Detail banner
  const barEl = document.getElementById('mdMeetBotBar');
  const barTextEl = document.getElementById('mdMeetBotStatusText');
  const barStopBtn = document.getElementById('mdMeetBotStopBtn');
  if (barEl) {
    const showOnDetail = active && (!activeMeetBot?.meetingId || activeMeetBot.meetingId === currentMeetingId);
    barEl.classList.toggle('hidden', !showOnDetail);
    if (barTextEl) {
      const timeStr = elapsed_sec > 0 ? ` (${fmt(elapsed_sec)})` : '';
      barTextEl.textContent = `${message || (lang==='en'?'KimKim is joining the meeting…':'KimKim đang tham gia cuộc họp…')}${timeStr}`;
    }
    if (barStopBtn) {
      barStopBtn.disabled = !canStop;
      barStopBtn.textContent = canStop ? '⏹ Kết thúc & Tóm tắt' : '⏳ Đang xử lý AI...';
    }
  }
}

async function finalizeMeetBotResult(botInfo, result) {
  const rawTranscript = result.transcript || [];
  const mappedSegments = rawTranscript.map(s => {
    const spk = mapSpeakerName(s.speaker || 'Speaker');
    return {
      t: Math.floor(s.t ?? s.start ?? 0),
      speaker: spk,
      color: getSpeakerColor(spk),
      text: (s.text || '').trim()
    };
  });

  const now = new Date();
  const finalTitle = botInfo.title || result.title || ('Google Meet ' + now.toLocaleString('vi-VN'));
  const durFormatted = fmt(result.duration_sec || 30);
  const summary = result.summary || '';
  const keyPoints = result.key_points || [];
  const actionItems = extractActionItems(summary);

  let meetingId = botInfo.meetingId;
  const existingMeeting = meetingId ? meetings.find(m => m.id === meetingId) : null;
  const mergedParticipants = Array.from(new Set([
    ...((existingMeeting && existingMeeting.participants) || []),
    ...(result.participants || [])
  ]));

  const meetingPayload = {
    title: finalTitle,
    date: (existingMeeting && existingMeeting.date) || now.toISOString().slice(0, 10),
    time: (existingMeeting && existingMeeting.time) || now.toTimeString().slice(0, 5),
    dur: durFormatted,
    status: 'done',
    participants: mergedParticipants,
    transcript: mappedSegments,
    summary,
    keyPoints,
    actionItems
  };

  try {
    if (meetingId) {
      await MeetingService.updateMeeting(meetingId, meetingPayload);
    } else {
      meetingId = await MeetingService.createMeeting(meetingPayload);
    }
  } catch (err) {
    console.warn('Firestore save warning for Meet Bot:', err);
    if (!meetingId) meetingId = 'm_' + Date.now();
  }

  meetingPayload.id = meetingId;
  const idx = meetings.findIndex(m => m.id === meetingId);
  if (idx >= 0) meetings[idx] = { ...meetings[idx], ...meetingPayload };
  else meetings.unshift(meetingPayload);

  // Also save summary to Notes if non-empty
  if (summary) {
    try {
      const noteId = await NoteService.createNote(finalTitle);
      if (noteId) await NoteService.updateNote(noteId, { title: finalTitle, content: summary });
    } catch (e) {
      console.warn('Could not create note from Meet Bot summary:', e);
    }
  }

  updateMeetBotUI({ active: false, status: 'done', message: '✅ Đã lưu biên bản cuộc họp Google Meet!' });
  renderAll();
  showView('meetings', document.querySelector('[data-view=meetings]'));
  openMeeting(meetingId);
}

/* ---------------- Summarization ---------------- */
async function endMeetingAndSummarize() {
  if (isMeetingRecording) stopMeetingRecording();
  await generateSummaryFromCurrentTranscript();
}

async function generateSummaryFromCurrentTranscript() {
  if (!segments || segments.length === 0) {
    notify("Chưa có nội dung cuộc họp nào để tóm tắt.");
    return;
  }

  const badge = document.getElementById('summaryStatusBadge');
  const btn = document.getElementById('btnQuickSummarize');
  if (badge) badge.classList.remove('hidden');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tóm tắt cuộc họp...'; }

  try {
    const apiUrl = getApiUrl();
    const res = await apiFetch(`${apiUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: segments })
    });
    const data = await res.json();

    if (data.status === 'ok') {
      currentSummaryData = data;
      const finalTitle = data.title || currentMeetingObj?.title || 'Cuộc họp mới';
      const finalDur = recordingSeconds ? fmt(recordingSeconds) : (currentMeetingObj?.dur && currentMeetingObj.dur !== '00:00' ? currentMeetingObj.dur : '00:30');
      const actionItems = extractActionItems(data.summary);

      const meetingUpdates = {
        title: finalTitle,
        transcript: segments,
        summary: data.summary,
        keyPoints: data.key_points || [],
        actionItems: actionItems,
        status: 'done',
        dur: finalDur
      };

      // 1. Persist to Firestore via MeetingService
      if (currentMeetingId) {
        try {
          await MeetingService.updateMeeting(currentMeetingId, meetingUpdates);
        } catch (mErr) {
          console.error("MeetingService.updateMeeting error:", mErr);
        }
        if (currentMeetingObj) {
          Object.assign(currentMeetingObj, meetingUpdates);
        }
      } else {
        const now = new Date();
        try {
          currentMeetingId = await MeetingService.createMeeting({
            ...meetingUpdates,
            date: now.toISOString().slice(0, 10),
            time: now.toTimeString().slice(0, 5),
            participants: []
          });
          currentMeetingObj = { id: currentMeetingId, ...meetingUpdates };
        } catch (cErr) {
          console.error("MeetingService.createMeeting error:", cErr);
        }
      }

      // Sync local meetings array cache
      if (currentMeetingId) {
        const existingIdx = meetings.findIndex(m => m.id === currentMeetingId);
        if (existingIdx >= 0) {
          meetings[existingIdx] = { ...meetings[existingIdx], ...meetingUpdates };
        } else if (currentMeetingObj) {
          meetings.unshift(currentMeetingObj);
        }
      }

      // 2. Persist to NoteService
      try {
        const noteId = await NoteService.createNote(finalTitle);
        if (noteId) {
          await NoteService.updateNote(noteId, { title: finalTitle, content: data.summary });
        }
      } catch (noteErr) {
        console.warn("Could not save note in NoteService:", noteErr);
      }

      // 3. Update DOM / render views
      renderMeetingDetail();
      renderAll();

      notify(`Tóm tắt thành công: "${finalTitle}"!\nKết quả đã được cập nhật vào cuộc họp và mục Ghi chú.`);
    } else {
      notify("Lỗi khi tóm tắt: " + (data.message || "Unknown error"));
    }
  } catch (err) {
    console.error("Summarization error:", err);
    notify("Không thể kết nối đến AI backend (" + getApiUrl() + "). Vui lòng đảm bảo server đang chạy.");
  } finally {
    if (badge) badge.classList.add('hidden');
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Tóm tắt cuộc họp với AI'; }
  }
}

/* ---------------- Trans Tab Switching & Q&A Chat ---------------- */
function switchTransTab(tab) {
  const isChat = tab === 'chat';
  document.getElementById('tabTranscriptBtn')?.classList.toggle('active', !isChat);
  document.getElementById('tabChatBtn')?.classList.toggle('active', isChat);
  document.getElementById('panelTranscript')?.classList.toggle('hidden', isChat);
  document.getElementById('panelMeetingChat')?.classList.toggle('hidden', !isChat);
}

async function sendMeetingChat() {
  return sendMeetingChatMsg();
}

document.getElementById('settingSttUrl')?.addEventListener('change', e => {
  localStorage.setItem('stt_url', e.target.value.trim());
});
document.getElementById('settingApiUrl')?.addEventListener('change', e => {
  localStorage.setItem('api_url', e.target.value.trim());
});

/* ---------------- App Initialization ---------------- */
function startApp() {
  document.getElementById('settingApiUrl').value = getApiUrl();
  document.getElementById('settingSttUrl').value = getSttUrl();
  try {
    setLang(lang);
  } catch (err) {
    console.error("renderAll init error:", err);
  }
  try {
    loadChatHistory();
  } catch (err) {
    console.error("loadChatHistory init error:", err);
  }
  try {
    initAuth();
  } catch (err) {
    console.error("initAuth error:", err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

// Keep native form keyboard behavior without changing Firebase auth flows.
for (const [id, action] of [['signinPassword',signInWithEmail],['signupPassword',signUpWithEmail],['resetEmail',sendPasswordReset]]) {
  document.getElementById(id)?.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing){event.preventDefault();action();}
  });
}
