const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('frontend/app.js','utf8');
function classes(initial=[]){const set=new Set(initial);return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle(x,force){const yes=force===undefined?!set.has(x):force;yes?set.add(x):set.delete(x);},set};}
function element(){return {classList:classes(),dataset:{},value:'',textContent:'',disabled:false,focus(){this.focused=true;},reset(){this.resetCalled=true;},setAttribute(k,v){this[k]=v;}};}
test('all four settings tabs reveal their actual pane, including settingsAI',()=>{
 const ids=['settingsAccount','settingsMeeting','settingsAI','settingsPassword'];
 const nodes=Object.fromEntries(ids.map(x=>[x,element()]));
 const tabs=['account','meeting','ai','password'].map(s=>({...element(),dataset:{s}}));
 const context={document:{getElementById:id=>nodes[id],querySelectorAll:()=>tabs}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function showSettings('),source.indexOf('function toggleSettingSwitch(')),context);
 tabs.forEach((tab,index)=>{context.showSettings(tab.dataset.s,tab);ids.forEach((id,i)=>assert.equal(nodes[id].classList.contains('hidden'),i!==index));assert.equal(tab['aria-selected'],'true');});
});
test('note body save failure can retry without creating a duplicate note',async()=>{
 const ids=['noteComposer','newNoteTitle','newNoteContent','newNoteError','newNoteSubmit'];
 const nodes=Object.fromEntries(ids.map(x=>[x,element()]));const cancel=element();
 nodes.newNoteTitle.value='  Tiêu đề mới  ';nodes.newNoteContent.value='Nội dung tiếng Việt';
 let creates=0,updates=0;
 const context={document:{getElementById:id=>nodes[id],querySelector:()=>cancel},NoteService:{createNote:async()=>{creates++;return 'id-1';},updateNote:async(id,data)=>{assert.equal(id,'id-1');assert.equal(data.title,'Tiêu đề mới');assert.equal(data.content,'Nội dung tiếng Việt');if(++updates===1)throw new Error('Synthetic save failure');}},t:k=>k,notify:()=>{},showView:()=>{},renderAll:()=>{}};
 vm.createContext(context);vm.runInContext('let currentNoteId=null,notesArr=[];'+source.slice(source.indexOf('function createNote(){'),source.indexOf('function openNote(')),context);vm.runInContext('function openNote(id){currentNoteId=id;}',context);
 await context.submitNewNote({preventDefault(){}});
 assert.equal(nodes.newNoteError.textContent,'Synthetic save failure');assert.equal(nodes.noteComposer.dataset.pendingId,'id-1');assert.equal(nodes.newNoteSubmit.disabled,false);
 await context.submitNewNote({preventDefault(){}});
 assert.equal(creates,1);assert.equal(updates,2);assert.equal(vm.runInContext('currentNoteId',context),'id-1');assert.equal(vm.runInContext('notesArr[0].content',context),'Nội dung tiếng Việt');assert.equal(nodes.noteComposer.classList.contains('hidden'),true);
});
test('note validation preserves the form and does not call storage',async()=>{
 const nodes=Object.fromEntries(['noteComposer','newNoteTitle','newNoteContent','newNoteError','newNoteSubmit'].map(x=>[x,element()]));
 const context={document:{getElementById:id=>nodes[id]},t:k=>k};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('async function submitNewNote('),source.indexOf('function openNote(')),context);
 await context.submitNewNote({preventDefault(){}});
 assert.equal(nodes.newNoteError.textContent,'uiNoteTitleRequired');assert.equal(nodes.newNoteTitle.focused,true);
});
test('UI handlers use page feedback and not browser alerts/prompts/confirms',()=>{
 assert.doesNotMatch(source,/\b(?:alert|prompt|confirm)\(/);
 const html=fs.readFileSync('frontend/index.html','utf8');
 assert.doesNotMatch(html,/class="[^\"]*side-add|id="addNewMenu"/);
 assert.match(html,/id="noteComposer"/);assert.match(html,/id="confirmDialog"/);
});
test('AI request payloads and configured endpoint resolution are unchanged',()=>{
 const baseline=JSON.parse(fs.readFileSync('regression_tests/ai-ui-contract.json','utf8'));
 const {createHash}=require('node:crypto');
 const payloads=s=>s.match(/body\s*:\s*JSON\.stringify\([^\n]+/g);
 assert.deepEqual(payloads(source),baseline.payloads);
 const endpoints=s=>s.slice(s.indexOf('function storedEndpoint('),s.indexOf('// Firebase credentials'));
 assert.equal(createHash('sha256').update(endpoints(source)).digest('hex'),baseline.endpoints_sha256);
});
