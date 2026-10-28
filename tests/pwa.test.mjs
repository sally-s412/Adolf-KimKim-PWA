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
 assert(css.includes('#091e4c'));assert(css.includes('data-theme=light'));assert(css.includes('232px'));assert(readFileSync('frontend/layout.js','utf8').includes("menu.className='mobile-menu-btn'"));
});

test('Recording includes localized KimKim Meeting invite without robot icons',()=>{
 const html=readFileSync('frontend/index.html','utf8');
 assert(html.includes('KimKim Meeting'));assert(html.includes('Mời KimKim vào Google Meet'));assert(html.includes('Dán link Google Meet để mời KimKim vào họp'));
 assert(!html.includes('🤖'));assert(!html.includes('Google Meet Bot (Adolf KimKim)'));
 for(const file of ['vi-vn.js','eng-en.js']){const s=readFileSync('frontend/localizations/'+file,'utf8');assert(s.includes('inviteKimkimMeet:'));assert(s.includes('kimkimMeetingDescription:'));}
});
