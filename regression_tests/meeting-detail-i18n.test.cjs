const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const root=path.resolve(__dirname,'..');
function setup(){
 const nodes=new Map();function el(id){if(!nodes.has(id))nodes.set(id,{id,textContent:'',innerHTML:'',value:'',disabled:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},setAttribute(k,v){this[k]=v},addEventListener(){},querySelectorAll(){return[]}});return nodes.get(id)}
 const labels=['detailBack','detailStopSummary','detailTranslationSoon','detailPowerPoint','detailSummaryImage'].map(k=>({dataset:{i18n:k},innerHTML:''}));
 const titles=[{dataset:{i18nTitle:'detailMicTitle'},title:''}];const aria=[{dataset:{i18nAria:'detailEndTitle'},setAttribute(k,v){this[k]=v}}];
 const doc={readyState:'loading',documentElement:{lang:'vi'},activeElement:null,addEventListener(){},dispatchEvent(){},getElementById:el,querySelector(){return null},querySelectorAll(q){return q==='[data-i18n]'?labels:q==='[data-i18n-title]'?titles:q==='[data-i18n-aria]'?aria:[]}};
 const notifications=[];const win={I18N:{vi:{},en:{}},location:{href:'https://example.test/'},open(){return null}};
 const ctx=vm.createContext({window:win,document:doc,console,Event:class{},localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,URL,Headers,Blob,notifications});
 for(const f of ['frontend/localizations/vi-vn.js','frontend/localizations/eng-en.js','frontend/app.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
 vm.runInContext("renderAll=()=>{};notify=message=>notifications.push(message);",ctx);
 return{ctx,el,labels,titles,aria,notifications};
}
test('switching locale updates detail controls and empty states without overwriting notes or saved content',()=>{
 const x=setup();x.el('mdNotesInput').value='Unsaved draft — giữ nguyên';x.el('mdSummary').innerHTML='User-authored summary';
 vm.runInContext("currentMeetingId='m1';currentMeetingObj={id:'m1',summary:'Nội dung gốc',keyPoints:[],actionItems:[],participants:[],title:'Tiêu đề của tôi'};setLang('en');",x.ctx);
 assert.equal(x.labels[0].innerHTML,'Back');assert.equal(x.el('mdKeyPoints').textContent,'No result yet.');assert.equal(x.el('btnQuickSummarize').textContent,'Ask KimKim to summarize');assert.equal(x.titles[0].title,'Start / stop live transcription');assert.equal(x.aria[0]['aria-label'],'Stop recording and summarize');assert.equal(x.el('mdNotesInput').value,'Unsaved draft — giữ nguyên');assert.equal(x.el('mdSummary').innerHTML,'User-authored summary');
 vm.runInContext("currentMeetingObj.document={};setLang('vi');",x.ctx);assert.equal(x.labels[0].innerHTML,'Quay lại');assert.equal(x.el('btnQuickSummarize').textContent,'Nhờ KimKim tóm tắt');assert.equal(x.el('mdNotesInput').value,'Unsaved draft — giữ nguyên');
});
test('in-flight summary keeps its progress label when language changes',()=>{const x=setup();x.el('btnQuickSummarize').textContent='Summarizing sections (2/4)';vm.runInContext("currentMeetingId='m1';analysisInFlight.add('summary:m1');setLang('en');",x.ctx);assert.equal(x.el('btnQuickSummarize').textContent,'Summarizing sections (2/4)');});
test('unavailable meeting translation is removed completely',()=>{const x=setup();const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');assert.doesNotMatch(html,/id="mdTranslateBtn"/);assert.equal(vm.runInContext('typeof toggleMeetingSummaryTranslation',x.ctx),'undefined');});
test('HTTP 200 JSON errors are not downloaded as PowerPoint files; error is localized',async()=>{const x=setup();vm.runInContext("currentMeetingId='m1';currentMeetingObj={summary:'Synthetic summary'};setLang('en');getApiUrl=()=> 'https://example.test';apiFetch=async()=>({headers:{get:()=> 'application/json'},blob(){throw Error('must not download JSON')}});",x.ctx);await vm.runInContext("requestGenerationHandler('slides')",x.ctx);assert.equal(x.el('mdGenerationJobs').textContent,'Error: The service did not return a valid file. Please try again.');});
test('the detail and create/edit Back controls are wired to locale keys',()=>{const s=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');assert.equal((s.match(/data-i18n="detailBack"/g)||[]).length,2);assert.doesNotMatch(s,/id="mdTranslateBtn"/);assert.doesNotMatch(s,/>← Quay lại<\/button>/);});


test('file format, source, status and search filters intersect without guessing legacy recording types',()=>{
 const x=setup();vm.runInContext(`meetings=[
 {id:'1',title:'Weekly audio',status:'done',source:{kind:'upload',format:'mp3'}},
 {id:'2',title:'Weekly Meet',status:'done',source:{kind:'kimkim_meeting',format:'unknown'}},
 {id:'3',title:'Weekly legacy',status:'done',dur:'34:29',meetUrl:'https://meet.google.com/abc-defg-hij'},
 {id:'4',title:'Handbook',status:'done',document:{kind:'pdf',name:'Handbook.pdf'}}];
 meetingFormatFilter='mp3';meetingSourceFilter='upload';activeMeetingFilter='done';searchQuery='weekly';`,x.ctx);
 assert.equal(vm.runInContext('visibleMeetings().map(m=>m.id).join()',x.ctx),'1');
 assert.equal(vm.runInContext('meetingFileInfo(meetings[2]).format',x.ctx),'unknown');assert.equal(vm.runInContext('meetingFileInfo(meetings[2]).kind',x.ctx),'unknown');
 assert.equal(vm.runInContext('meetingFileInfo(meetings[3]).format',x.ctx),'pdf');
 vm.runInContext("meetingFormatFilter='all';meetingSourceFilter='kimkim_meeting';",x.ctx);assert.equal(vm.runInContext('visibleMeetings().map(m=>m.id).join()',x.ctx),'2');
});
test('source metadata distinguishes uploaded M4A from MP4 and preserves recorder MIME types',()=>{
 const x=setup();assert.equal(vm.runInContext("sourceMetadata('upload',{name:'a.M4A',type:'audio/mp4'}).format",x.ctx),'m4a');assert.equal(vm.runInContext("sourceMetadata('upload',{name:'a.mp4',type:'video/mp4'}).format",x.ctx),'mp4');assert.equal(vm.runInContext("sourceMetadata('recorder',{type:'audio/webm;codecs=opus'}).format",x.ctx),'webm');
});
test('Completed content is not presented as a saved AI result',()=>{const x=setup();vm.runInContext("setLang('en');meetingsState='ready';meetings=[{id:'1',title:'Imported audio',status:'done',summary:''}];renderMeetingsTable();",x.ctx);assert.match(x.el('meetingsTable').innerHTML,/AI summary: No result saved/);vm.runInContext("meetings[0].summary='Saved summary';renderMeetingsTable();",x.ctx);assert.match(x.el('meetingsTable').innerHTML,/AI summary: Result saved/);});
test('createMeeting persists supplied AI results and source metadata instead of clearing them',async()=>{
 let stored;const context=vm.createContext({window:{FirebaseClient:{userCol(){return{add:async data=>{stored=data;return{id:'new-id'}}}},serverTimestamp(){return 'server-time'}}}});
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/services/meetingService.js'),'utf8'),context);
 const data={title:'Imported result',summary:'Saved worker summary',keyPoints:['Point'],actionItems:['Action'],notes:'Note',source:{kind:'kimkim_meeting',format:'unknown'}};
 await context.window.MeetingService.createMeeting(data);assert.equal(stored.summary,data.summary);assert.equal(stored.source.kind,'kimkim_meeting');assert.equal(stored.keyPoints[0],'Point');assert.equal(stored.actionItems[0],'Action');
});


test('known stored AI errors use locale labels without rewriting real answers',()=>{const x=setup();vm.runInContext("setLang('en')",x.ctx);assert.match(vm.runInContext("meetingAgentContent('Xin lỗi, không thể kết nối tới mô hình AI lúc này.')",x.ctx),/data-i18n="detailAIUnavailable"/);assert.match(vm.runInContext("meetingAgentContent('Xin lỗi, không thể kết nối tới mô hình AI lúc này.')",x.ctx),/KimKim is unavailable/);assert.equal(vm.runInContext("meetingSystemMessageKey('Nội dung chính của cuộc họp là gì')",x.ctx),null);assert.equal(vm.runInContext("meetingSystemMessageKey('This is the actual summary.')",x.ctx),null);});
test('switching locale preserves form drafts and the edit form title',()=>{const x=setup();x.el('cmTitle').value='Tên tự nhập';vm.runInContext("editingMeetingId='m1';setLang('en')",x.ctx);assert.equal(x.el('cmFormTitle').textContent,'Edit details');assert.equal(x.el('cmSubmitBtn').textContent,'Save');assert.equal(x.el('cmTitle').value,'Tên tự nhập');vm.runInContext("setLang('vi')",x.ctx);assert.equal(x.el('cmFormTitle').textContent,'Chỉnh sửa thông tin');assert.equal(x.el('btnQuickSummarize').textContent,'Nhờ KimKim tóm tắt');});
test('restored detail keeps the old layout and every interface key exists in both languages',()=>{const x=setup();const s=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');const part=s.split('id="view-meetingDetail"')[1].split('<!-- ===== CREATE / EDIT MEETING')[0];assert.match(part,/class="detail-split"/);assert.doesNotMatch(part,/studio-grid|scopedChatNote/);for(const m of part.matchAll(/data-i18n(?:-ph|-title|-aria)?="([^"]+)"/g))for(const l of ['en','vi'])assert.ok(x.ctx.window.I18N[l][m[1]],l+': '+m[1]);});
