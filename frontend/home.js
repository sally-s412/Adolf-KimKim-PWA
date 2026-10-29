/* Home presentation only. Existing auth, recording and AI handlers remain authoritative. */
const HOME_COPY = {
  vi: {heading:'Bạn muốn bắt đầu từ đâu',sub:'Để KimKim ghi lại, đọc hiểu và tóm tắt cho bạn.',record:'Ghi âm cuộc họp',recordSub:'Ghi lại cuộc trò chuyện và nắm bắt những nội dung quan trọng.',recordAction:'Ghi cuộc họp trực tiếp',meet:'Mời KimKim vào Meet',meetSub:'Chia sẻ đường link để mời KimKim tham gia cuộc họp.',meetAction:'Mời KimKim vào Meet',upload:'Tải tệp lên',uploadSub:'Tải âm thanh, video, PDF hoặc DOCX để đọc nội dung và tóm tắt.',uploadAction:'Chọn tệp để tải lên',recent:'Tệp & bản ghi gần đây',all:'Xem tất cả',empty:'Chưa có nội dung nào. Bắt đầu bằng cách ghi âm hoặc tải tệp lên.',loading:'Đang tải nội dung…',error:'Chưa tải được nội dung. Vui lòng thử lại sau.',pdf:'Tài liệu PDF',docx:'Tài liệu Word',recording:'Bản ghi',open:'Mở nội dung'},
  en: {heading:'Where would you like to start',sub:'Let KimKim capture, understand and summarize for you.',record:'Record a meeting',recordSub:'Capture your conversations and keep the important details.',recordAction:'Record a live meeting',meet:'Invite KimKim to Meet',meetSub:'Share a Google Meet link to invite KimKim to your meeting.',meetAction:'Invite KimKim to Meet',upload:'Upload a file',uploadSub:'Upload audio, video, PDF or DOCX to read and summarize.',uploadAction:'Choose a file',recent:'Recent files & recordings',all:'View all',empty:'No content yet. Start a recording or upload your first file.',loading:'Loading your content…',error:'Content could not be loaded. Please try again later.',pdf:'PDF document',docx:'Word document',recording:'Recording',open:'Open content'}
};

function homeContentKind(meeting) {
  if(meeting.document?.kind === 'pdf') return 'pdf';
  if(meeting.document?.kind === 'docx') return 'docx';
  return 'recording'; // Older records do not reliably identify their capture source.
}

function renderHome() {
  const root=document.getElementById('view-home');
  if(!root)return;
  const copy=HOME_COPY[lang] || HOME_COPY.vi;
  root.querySelectorAll('[data-home-copy]').forEach(el=>{el.textContent=copy[el.dataset.homeCopy] || '';});
  const heading=root.querySelector('#homeHeading');
  const name=currentUser?.displayName || currentUser?.email?.split('@')[0] || '';
  heading.textContent=copy.heading+(name?', '+name:'')+'?';
  root.querySelectorAll('[data-home-icon]').forEach(el=>{
    const source=document.querySelector('.sidebar [data-view="'+el.dataset.homeIcon+'"] .ic');
    if(source)el.innerHTML=source.innerHTML;
  });
  const list=root.querySelector('#homeRecent');
  list.replaceChildren();
  if(meetingsState!=='ready' || !meetings.length){
    const empty=document.createElement('p');empty.className='home-empty';empty.setAttribute('role','status');
    empty.textContent=meetingsState==='loading'?copy.loading:meetingsState==='error'?copy.error:copy.empty;
    list.append(empty);return;
  }
  // Firestore watchMeetings already orders createdAt descending.
  meetings.slice(0,3).forEach(meeting=>{
    const kind=homeContentKind(meeting);
    const item=document.createElement('button');item.type='button';item.className='home-recent-item';
    item.onclick=()=>openMeeting(meeting.id);
    const icon=document.createElement('span');icon.className='home-file-icon';icon.setAttribute('aria-hidden','true');
    icon.textContent=kind==='pdf'?'PDF':kind==='docx'?'DOC':'REC';
    const text=document.createElement('span');text.className='home-file-text';
    const title=document.createElement('strong');title.textContent=meeting.title || copy.open;
    const meta=document.createElement('span');meta.className='home-file-meta';
    meta.textContent=copy[kind]+(meeting.date?' · '+meeting.date:'');
    const state=document.createElement('span');state.className='home-file-state';
    state.innerHTML=statusBadge(meeting.status);
    text.append(title,meta,state);item.append(icon,text);list.append(item);
  });
}

function homeRecord(){showView('recording',document.querySelector('.sidebar [data-view=recording]'));document.getElementById('recStartBtn')?.focus();}
function homeMeet(){showView('recording',document.querySelector('.sidebar [data-view=recording]'));document.getElementById('recMeetUrl')?.focus();}
function homeUpload(){showView('uploads',document.querySelector('.sidebar [data-view=uploads]'));selectUploadFile();}
document.addEventListener('DOMContentLoaded',renderHome);
