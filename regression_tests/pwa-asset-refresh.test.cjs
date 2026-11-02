const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');const {execFileSync}=require('node:child_process');
test('new shell precaches fresh assets and leaves authenticated writes and external traffic alone',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'akk-shell-'));
 try{
  fs.mkdirSync(path.join(dir,'frontend'));fs.writeFileSync(path.join(dir,'frontend/index.html'),'<head></head>');fs.writeFileSync(path.join(dir,'frontend/app.js'),'/* fixture */');fs.writeFileSync(path.join(dir,'frontend/offline.html'),'Offline');
  execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/build.mjs')],{cwd:dir});
  const source=fs.readFileSync(path.join(dir,'frontend/sw.js'),'utf8');let savedRequests;const handlers={};
  const self={location:{href:'https://example.test/sw.js'},addEventListener(name,handler){handlers[name]=handler}};
  vm.runInNewContext(source,{self,URL,Request,caches:{open:async()=>({addAll:async requests=>{savedRequests=requests}})}});
  let installed;handlers.install({waitUntil(p){installed=p}});await installed;
  assert(savedRequests.length>0);assert(savedRequests.every(r=>r.cache==='reload'));assert(savedRequests.some(r=>r.url==='https://example.test/app.js'));
  for(const req of [{method:'POST',url:'https://example.test/api/chat'},{method:'GET',url:'https://example.test/api/analysis-jobs/1'},{method:'GET',url:'https://other.test/app.js'}]){
   let intercepted=false;handlers.fetch({request:req,respondWith(){intercepted=true}});assert.equal(intercepted,false);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
