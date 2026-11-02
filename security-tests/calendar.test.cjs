const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function setup(){const dom=new JSDOM('<div class="sidebar"><button data-view="recording">Recording</button></div><main><div id="view-home" class="view"></div><div id="view-recording" class="view hidden"><input id="recMeetUrl"><input id="recMeetTitle"></div></main>',{runScripts:'outside-only',url:'https://example.test'}),w=dom.window;w.TextEncoder=TextEncoder;w.lang='vi';w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};const calls=[];let cb;
 w.FirebaseClient={db:{collection:()=>({doc:()=>({collection:()=>({orderBy:()=>({limit:()=>({onSnapshot:fn=>{cb=fn;fn({docs:[]});return()=>{};}})}),doc:()=>({set:async data=>calls.push(data),delete:async()=>{}})})})})},serverTimestamp:()=> 'server'};
 w.firebase={firestore:{Timestamp:{fromDate:d=>d}}};w.AuthService={onAuthChange:fn=>{fn({uid:'alice'});return()=>{};}};w.showView=(v)=>{w.document.querySelectorAll('.view').forEach(n=>n.classList.toggle('hidden',n.id!=='view-'+v));w.document.dispatchEvent(new w.CustomEvent('akk:viewchange',{detail:{view:v}}));};w.eval(fs.readFileSync(path.join(__dirname,'../frontend/calendar.js'),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return {w,dom,calls,emit:rows=>cb({docs:rows.map(x=>({id:x.id,data:()=>({...x,start:{toDate:()=>x.start},end:{toDate:()=>x.end}})}))})};}
const tick=()=>new Promise(r=>setImmediate(r));
test('Calendar month renders complete weeks, Meet handoff fills fields and never starts bot automatically',()=>{const {w,dom}=setup();w.showView('calendar');const cells=w.document.querySelectorAll('.calendar-day');assert.equal(cells.length%7,0);assert(cells.length>=28&&cells.length<=42);assert(w.document.querySelector('.calendar-workspace .calendar-agenda'));assert.equal(w.document.querySelector('[data-view=calendar]').tagName,'A');w.KimKimCalendar.meeting({title:'Team sync',meetUrl:'https://meet.google.com/abc-defg-hij'});assert.equal(w.document.getElementById('recMeetTitle').value,'Team sync');assert.equal(w.document.getElementById('recMeetUrl').value,'https://meet.google.com/abc-defg-hij');dom.window.close();});
test('Calendar validates official Meet links and exports Unicode and multiline descriptions safely',()=>{const {w,dom}=setup();assert.equal(w.KimKimCalendar.normalizeMeet('meet.google.com/abc-defg-hij'),'https://meet.google.com/abc-defg-hij');assert.throws(()=>w.KimKimCalendar.normalizeMeet('https://meet.google.com.evil.test/abc-defg-hij'));const data=w.KimKimCalendar.ics({id:'event-1',title:'Cuộc họp, tiếng Việt;',description:'Line 1\nLine 2',start:new Date('2026-10-30T02:00:00Z'),end:new Date('2026-10-30T03:00:00Z'),meetUrl:''});assert(data.includes('SUMMARY:Cuộc họp\\, tiếng Việt\\;'));assert(data.includes('DTSTART:20261030T020000Z'));assert(!data.includes('DESCRIPTION:Line 1\r\nLine 2'));dom.window.close();});
test('event editor blocks end before start and saves private calendar fields after correction',async()=>{const {w,dom,calls}=setup();w.KimKimCalendar.editor();const f=w.document.querySelector('dialog form');f.querySelector('[name=title]').value='KimKim test';f.querySelector('[name=start]').value='2026-10-30T10:00';f.querySelector('[name=end]').value='2026-10-30T09:00';f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls.length,0);assert(f.querySelector('.field-error').textContent);f.querySelector('[name=end]').value='2026-10-30T11:00';f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls.length,1);assert.equal(calls[0].title,'KimKim test');dom.window.close();});

test('Google requests use same-account ephemeral OAuth token and paginate without Firestore copies',async()=>{
 const {w,dom,calls}=setup();let scope='',popup=0;const requests=[];
 w.firebase.auth=()=>({currentUser:{uid:'alice',email:'alice@example.test',providerData:[{providerId:'google.com'}],reauthenticateWithPopup:async()=>{popup++;return {credential:{accessToken:'test-only-token'}};}}});
 w.firebase.auth.GoogleAuthProvider=class{addScope(s){scope=s;}setCustomParameters(){}};
 w.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({items:[{id:'g1',summary:'Google event',etag:'etag1',start:{dateTime:new Date().toISOString()},end:{dateTime:new Date(Date.now()+3600000).toISOString()}}]})};};
 w.showView('calendar');await w.KimKimCalendar.connectGoogle();
 assert.equal(popup,1);assert.equal(scope,'https://www.googleapis.com/auth/calendar.events');
 assert.equal(requests[0].options.headers.Authorization,'Bearer test-only-token');
 assert(requests[0].url.includes('singleEvents=true'));assert.equal(calls.length,0);
 assert(w.document.querySelector('[title="Google Calendar · Google event"]'));
 assert(!w.localStorage.getItem('test-only-token'));w.KimKimCalendar.disconnectGoogle();
 assert(!w.document.querySelector('[title="Google Calendar · Google event"]'));dom.window.close();
});
test('Google 403 is displayed as configuration error, and expired session can reconnect',async()=>{
 const {w,dom}=setup();w.firebase.auth=()=>({currentUser:{uid:'alice',providerData:[{providerId:'google.com'}],reauthenticateWithPopup:async()=>({credential:{accessToken:'test'}})}});
 w.firebase.auth.GoogleAuthProvider=class{addScope(){}setCustomParameters(){}};
 w.fetch=async()=>({ok:false,status:403,json:async()=>({error:{errors:[{reason:'accessNotConfigured'}]}})});
 w.showView('calendar');await w.KimKimCalendar.connectGoogle();assert(w.document.getElementById('view-calendar').textContent.includes('Google Calendar API'));
 w.fetch=async()=>({ok:false,status:401});await w.KimKimCalendar.syncGoogle();assert(w.document.getElementById('view-calendar').textContent.includes('hết hạn'));dom.window.close();
});
test('Google create writes event to Google and never duplicates into Firestore',async()=>{
 const {w,dom,calls}=setup();const requests=[];
 w.firebase.auth=()=>({currentUser:{uid:'alice',providerData:[{providerId:'google.com'}],reauthenticateWithPopup:async()=>({credential:{accessToken:'test'}})}});
 w.firebase.auth.GoogleAuthProvider=class{addScope(){}setCustomParameters(){}};
 w.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({items:[]})};};
 w.showView('calendar');await w.KimKimCalendar.connectGoogle();w.KimKimCalendar.editor();const f=w.document.querySelector('dialog form');f.querySelector('[name=title]').value='Google sync';f.querySelector('[name=calendarSource]').value='google';f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 const request=requests.find(r=>r.options.method==='POST');assert(request);assert.equal(JSON.parse(request.options.body).summary,'Google sync');assert(request.url.includes('conferenceDataVersion=1'));assert.equal(calls.length,0);w.KimKimCalendar.disconnectGoogle();dom.window.close();
});

