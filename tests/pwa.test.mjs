import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import vm from 'node:vm';

test('install manifest references real, correctly sized icons', () => {
  const manifest = JSON.parse(readFileSync('frontend/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) {
    const data = readFileSync(`frontend/${icon.src}`);
    const [width,height] = icon.sizes.split('x').map(Number);
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), height);
  }
  assert(existsSync('frontend/assets/icons/apple-touch-icon.png'));
});

function worker() {
  const listeners = new Map();
  const context = {
    URL, Response,
    self: {location:{href:'https://example.test/sw.js'}, addEventListener:(name,fn)=>listeners.set(name,fn)},
    caches:{open:async()=>({match:async()=>new Response('offline fallback')})},
    fetch:async()=>{throw new Error('offline')},
  };
  vm.runInNewContext(readFileSync('frontend/sw.js','utf8'),context);
  return event => listeners.get('fetch')(event);
}

test('worker never handles API calls, Firebase requests, recordings or uploads', () => {
  const handle = worker();
  for (const [url,method] of [
    ['https://example.test/api/global-chat','GET'],
    ['https://example.test/api/transcribe','POST'],
    ['https://firestore.googleapis.com/data','GET'],
    ['https://example.test/private-recording.webm','GET'],
    ['https://example.test/sensitive-document.pdf','GET'],
  ]) {
    let intercepted = false;
    handle({request:{url,method,mode:'cors'},respondWith:()=>{intercepted=true}});
    assert.equal(intercepted,false,`${method} ${url}`);
  }
});

test('offline navigation returns the explanatory offline page', async () => {
  let result;
  worker()({request:{url:'https://example.test/',method:'GET',mode:'navigate'},respondWith:p=>{result=p}});
  assert.equal(await (await result).text(),'offline fallback');
});

test('private message push shows a generic notification and opens its thread', async () => {
  const listeners = new Map(), notices = [];
  const page = {url:'https://example.test/',visibilityState:'hidden',focused:false,messages:[],postMessage(data){this.messages.push(data)},navigate:async url=>{page.url=url},focus:async()=>{}};
  const self = {location:{href:'https://example.test/sw.js'},addEventListener:(name,fn)=>listeners.set(name,fn),clients:{matchAll:async()=>[page]},registration:{showNotification:async(title,options)=>notices.push({title,options})}};
  vm.runInNewContext(readFileSync('frontend/sw.js','utf8'),{self,URL,Response,caches:{},fetch:async()=>{}});
  let work;
  listeners.get('push')({data:{json:()=>({data:{type:'kimkim-message',threadId:'thread-1',messageId:'12345678901234567890',title:'Sally',body:'Bạn có tin nhắn mới'}})},waitUntil:promise=>{work=promise}});
  await work;
  assert.equal(notices.length,1);
  assert.equal(page.messages[0].messageId,'12345678901234567890');
  assert.equal(notices[0].options.body,'Bạn có tin nhắn mới');
  assert.equal(notices[0].options.data.url,'https://example.test/#messages/thread-1');
  listeners.get('notificationclick')({notification:{data:notices[0].options.data,close(){}},waitUntil:promise=>{work=promise}});
  await work;
  assert.equal(page.url,'https://example.test/#messages/thread-1');
});

test('a waiting update blocks the app until activation and reloads after acceptance', async () => {
  const html=readFileSync('frontend/index.html','utf8');
  assert(html.includes('<script defer src="pwa-update.js?v=1"></script>'));
  const elements=new Map(['appUpdateDialog','appUpdateTitle','appUpdateDescription','appUpdateStatus','appUpdateConfirm'].map(id=>[id,{open:false,disabled:false,textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn},showModal(){this.open=true}}]));
  const listeners={};
  const waiting={messages:[],postMessage(value){this.messages.push(value)}};
  const registration={waiting,addEventListener(name,fn){listeners['reg:'+name]=fn},update:async()=>{}};
  let reloads=0;
  const context={navigator:{onLine:true,serviceWorker:{controller:{},register:async()=>registration,addEventListener(name,fn){listeners['sw:'+name]=fn}}},window:{isSecureContext:true,location:{reload(){reloads++}},addEventListener(name,fn){listeners['window:'+name]=fn}},document:{documentElement:{lang:'vi'},hidden:false,getElementById:id=>elements.get(id),addEventListener(name,fn){listeners['doc:'+name]=fn}},setInterval(){},setTimeout(){}};
  vm.runInNewContext(readFileSync('frontend/pwa-update.js','utf8'),context);
  await listeners['window:load']();
  const dialog=elements.get('appUpdateDialog'),button=elements.get('appUpdateConfirm');
  assert.equal(dialog.open,true);
  assert.equal(button.textContent,'Cập nhật ngay');
  let prevented=false;dialog.listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);
  button.listeners.click();
  assert.deepEqual(Array.from(waiting.messages, x=>x.type),['SKIP_WAITING']);
  listeners['sw:controllerchange']();
  assert.equal(reloads,1);
});

test('endpoint configuration respects the deployment and explicit user override', () => {
  const source=readFileSync('frontend/app.js','utf8');
  const section=source.slice(source.indexOf('function storedEndpoint'),source.indexOf('function getMeetingLang'));
  const stored=new Map();
  const context={window:{AKK_CONFIG:{apiBaseUrl:'https://api.example.test/',sttUrl:'wss://speech.example.test/live'},location:{origin:'https://example.test'}},localStorage:{getItem:k=>stored.get(k)}};
  vm.runInNewContext(section,context);
  assert.equal(context.getApiUrl(),'https://api.example.test');
  assert.equal(context.getSttUrl(),'wss://speech.example.test/live');
  stored.set('api_url','https://user-api.example.test/');
  assert.equal(context.getApiUrl(),'https://user-api.example.test');
  stored.clear();context.window.AKK_CONFIG={};
  assert.equal(context.getApiUrl(),'https://example.test');
  assert.equal(context.getSttUrl(),'wss://example.test/v1/ws/realtime-speech');
  assert(!source.includes('trycloudflare.com'));
});

test('deployment includes FINAL Figma shell, responsive theme and navigation',()=>{
 const html=readFileSync('frontend/index.html','utf8');
 assert(html.includes('href="design-system.css"'));
 assert(html.includes('src="layout.js"'));
 const css=readFileSync('frontend/design-system.css','utf8');
 assert(css.includes('--canvas:'));assert(css.includes('data-theme=light'));assert(css.includes('grid-template-columns:')); assert(readFileSync('frontend/layout.js','utf8').includes("menu.className='mobile-menu-btn'"));
});

test('Recording includes localized KimKim Meeting invite without robot icons',()=>{
 const html=readFileSync('frontend/index.html','utf8');
 assert(html.includes('KimKim Meeting'));assert(html.includes('Mời KimKim vào Google Meet'));assert(html.includes('Dán link Google Meet để mời KimKim vào họp'));
 assert(!html.includes('🤖'));assert(!html.includes('Google Meet Bot (Adolf KimKim)'));
 for(const file of ['vi-vn.js','eng-en.js']){const s=readFileSync('frontend/localizations/'+file,'utf8');assert(s.includes('inviteKimkimMeet:'));assert(s.includes('kimkimMeetingDescription:'));}
});
