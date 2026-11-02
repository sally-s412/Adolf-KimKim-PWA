const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(__dirname+'/../frontend/app.js','utf8');
const block=s.slice(s.indexOf('function safeServiceMessage'),s.indexOf('async function apiFetch'));
function setup(lang){const context={lang};vm.createContext(context);vm.runInContext(block,context);return context;}
test('legacy HTML and internal diagnostics are replaced with concise messages',()=>{for(const lang of ['vi','en']){const c=setup(lang);for(const text of ['502: <!DOCTYPE html><html>Cloudflare</html>','Gipformer STT error (502): private', 'Traceback private', 'https://tunnel.trycloudflare.com','a'.repeat(1000)]){const msg=c.safeServiceMessage(text);assert(msg.length<200);assert(!/html|Gipformer|Traceback|trycloudflare/.test(msg));}}});
test('upload 500, 502, 503 and timeout are translated without HTML',()=>{const c=setup('vi');for(const status of [500,502,503,504]){const msg=c.apiErrorMessage(status,'private <html>body','/api/transcribe');assert(!msg.includes('html'));assert(!msg.includes('private'));assert(msg.length<250);}});
test('ordinary application errors are preserved',()=>{const c=setup('en');assert.equal(c.safeServiceMessage('Please select a file.'),'Please select a file.');assert.equal(c.apiErrorMessage(400,'Invalid file','/api/documents/extract'),'Invalid file');});
test('persisted upload names and errors are escaped before HTML rendering',()=>{assert(s.includes('escapeHtml(safeServiceMessage(u.errorMessage'));assert(s.includes('escapeHtml(u.name)'));});
