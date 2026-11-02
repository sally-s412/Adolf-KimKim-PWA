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
 assert.equal(x.labels[0].innerHTML,'Back');assert.equal(x.el('mdKeyPoints').textContent,'No result yet.');assert.equal(x.el('btnQuickSummarize').textContent,'Summarize meeting with AI');assert.equal(x.titles[0].title,'Start / stop live transcription');assert.equal(x.aria[0]['aria-label'],'Stop recording and summarize');assert.equal(x.el('mdNotesInput').value,'Unsaved draft — giữ nguyên');assert.equal(x.el('mdSummary').innerHTML,'User-authored summary');
 vm.runInContext("currentMeetingObj.document={};setLang('vi');",x.ctx);assert.equal(x.labels[0].innerHTML,'Quay lại');assert.equal(x.el('btnQuickSummarize').textContent,'Tóm tắt tài liệu với AI');assert.equal(x.el('mdNotesInput').value,'Unsaved draft — giữ nguyên');
});
test('in-flight summary keeps its progress label when language changes',()=>{const x=setup();x.el('btnQuickSummarize').textContent='Summarizing sections (2/4)';vm.runInContext("currentMeetingId='m1';analysisInFlight.add('summary:m1');setLang('en');",x.ctx);assert.equal(x.el('btnQuickSummarize').textContent,'Summarizing sections (2/4)');});
test('unavailable translation never replaces content with the old [EN] passthrough',async()=>{const x=setup();x.el('mdSummary').innerHTML='Original content';vm.runInContext("setLang('en');",x.ctx);await vm.runInContext('toggleMeetingSummaryTranslation()',x.ctx);assert.equal(x.el('mdSummary').innerHTML,'Original content');assert.equal(x.notifications.at(-1),'Translation is not connected yet. Your original summary is unchanged.');});
test('HTTP 200 JSON errors are not downloaded as PowerPoint files; error is localized',async()=>{const x=setup();vm.runInContext("currentMeetingId='m1';currentMeetingObj={summary:'Synthetic summary'};setLang('en');getApiUrl=()=> 'https://example.test';apiFetch=async()=>({headers:{get:()=> 'application/json'},blob(){throw Error('must not download JSON')}});",x.ctx);await vm.runInContext("requestGenerationHandler('slides')",x.ctx);assert.equal(x.el('mdGenerationJobs').textContent,'Error: The service did not return a valid file. Please try again.');});
test('the detail and create/edit Back controls and disabled translation are wired to locale keys',()=>{const s=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');assert.equal((s.match(/data-i18n="detailBack"/g)||[]).length,2);assert.match(s,/id="mdTranslateBtn"[^>]+disabled[^>]+detailTranslationSoon/);assert.doesNotMatch(s,/>← Quay lại<\/button>/);});
