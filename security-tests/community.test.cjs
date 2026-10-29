const path=require('node:path');
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
let env;
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
const A='alice',B='bob',C='charlie';
function client(id){
  const db=env.authenticatedContext(id).firestore(),user={uid:id,displayName:id,photoURL:'https://example.test/avatar.jpg'};
  const window={FirebaseClient:{db,uid:()=>id,serverTimestamp:stamp},firebase:{auth:()=>({currentUser:user})},crypto};
  new Function('window',fs.readFileSync(path.join(__dirname,'../frontend/services/communityService.js'),'utf8'))(window);
  return {db,s:window.CommunityService};
}
async function admin(fn){return env.withSecurityRulesDisabled(ctx=>fn(ctx.firestore()));}
async function seed(){await admin(async db=>{for(const id of [A,B,C])await db.doc('communityProfiles/'+id).set({name:id,handle:id,bio:'',avatarUrl:'',createdAt:firebase.firestore.Timestamp.now(),updatedAt:firebase.firestore.Timestamp.now()});});}
async function friends(){const a=client(A),b=client(B);await a.s.invite(B);await b.s.respond(A,'accepted');return {a,b};}
async function thread(){await seed();const {a,b}=await friends();const id=await a.s.openThread(B);return {a,b,id};}
async function clearGate(id,kind='message'){await admin(db=>db.doc(`communityGates/${id}/limits/${kind}`).delete());}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-kimkim-community',firestore:{host:'127.0.0.1',port:8189,rules:fs.readFileSync(path.join(__dirname,'firestore.rules'),'utf8')}});});
beforeEach(async()=>env.clearFirestore());
after(async()=>env?.cleanup());

test('profile opt-in reserves one immutable handle and rejects PII injection',async()=>{
  const a=client(A),b=client(B);await assertSucceeds(a.s.saveProfile({name:'Alice Test',handle:'alice_test',bio:'Xin chào'}));
  assert.equal((await b.s.getProfile(A)).bio,'Xin chào');
  await assertFails(b.db.doc('communityProfiles/alice').update({name:'Pretend Alice',updatedAt:stamp()}));
  await assertFails(a.db.doc('communityProfiles/alice').update({email:'private@example.test',updatedAt:stamp()}));
  await assert.rejects(b.s.saveProfile({name:'Bob Test',handle:'alice_test'}));
  await assert.rejects(a.s.saveProfile({name:'Alice Test',handle:'new_handle'}));
  await assertFails(env.unauthenticatedContext().firestore().doc('communityProfiles/alice').get());
});
test('search is limited and private user data never becomes a public profile',async()=>{
  await seed();const b=client(B);await admin(db=>db.doc('users/alice').set({email:'secret@example.test'}));
  await assertFails(b.db.doc('users/alice').get());
  await assertFails(b.db.collection('communityProfiles').get());
  const found=await b.s.search('ali');assert.equal(found.length,1);assert.equal(found[0].id,A);
});
test('only recipient may accept and members cannot be rewritten',async()=>{
  await seed();const a=client(A),b=client(B),c=client(C);await a.s.invite(B);
  await assertFails(a.s.respond(B,'accepted'));await assertFails(c.db.doc('communityConnections/alice~bob').get());
  await assertFails(b.db.doc('communityConnections/alice~bob').update({members:[B,C],updatedAt:stamp()}));
  await assertSucceeds(b.s.respond(A,'accepted'));
});
test('invite spoofing self requests and rate-limit bypass are denied',async()=>{
  await seed();const a=client(A);await assert.rejects(a.s.invite(A));await a.s.invite(B);
  await assertFails(a.s.invite(C));
  const d={members:[A,C],senderId:C,status:'pending',createdAt:stamp(),updatedAt:stamp()};
  await assertFails(a.db.doc('communityConnections/alice~charlie').set(d));
});
test('cancel decline and resending use authorized state transitions',async()=>{
  await seed();const a=client(A),b=client(B);await a.s.invite(B);await b.s.respond(A,'declined');await clearGate(A,'invite');
  await a.s.invite(B);await a.s.respond(B,'cancelled');await clearGate(B,'invite');
  await b.s.invite(A);await a.s.respond(B,'accepted');
});
test('a non-friend cannot create a conversation',async()=>{await seed();await assertFails(client(A).s.openThread(B));});
test('two friends share one thread with durable realtime text and idempotent retry',async()=>{
  const {a,b,id}=await thread();assert.equal(await b.s.openThread(A),id);const msg=crypto.randomUUID();
  const update=new Promise((resolve,reject)=>{const off=b.s.watchMessages(id,rows=>{if(rows.length&&rows[0].createdAt){off();resolve(rows);}},reject);});
  await a.s.sendMessage(id,'Xin chào 👋',msg);await a.s.sendMessage(id,'Xin chào 👋',msg);
  const rows=await update;assert.equal(rows[0].text,'Xin chào 👋');assert.equal((await b.db.collection(`communityThreads/${id}/messages`).limit(30).get()).size,1);
  await b.s.markRead(id);assert((await b.s.getReceipt(id)).readAt);
});
test('third user cannot list read or write another conversation',async()=>{
  const {a,id}=await thread(),c=client(C),msg=crypto.randomUUID();await a.s.sendMessage(id,'Private text',msg);
  await assertFails(c.db.doc(`communityThreads/${id}`).get());
  await assertFails(c.db.collection(`communityThreads/${id}/messages`).limit(30).get());
  await assertFails(c.db.doc(`communityThreads/${id}/messages/${msg}`).get());
  await assertFails(c.s.sendMessage(id,'Intruder',crypto.randomUUID()));
});
test('sender impersonation immutable history and arbitrary thread preview writes are denied',async()=>{
  const {a,b,id}=await thread(),msg=crypto.randomUUID();await a.s.sendMessage(id,'Original',msg);
  await assertFails(b.db.doc(`communityThreads/${id}/messages/${msg}`).update({text:'Changed'}));
  await assertFails(a.db.doc(`communityThreads/${id}/messages/${msg}`).delete());
  await assertFails(b.db.doc(`communityThreads/${id}`).update({lastText:'Fake',updatedAt:stamp(),lastMessageId:msg,lastSenderId:B}));
  const batch=b.db.batch(),fake=crypto.randomUUID();batch.set(b.db.doc(`communityGates/${B}/limits/message`),{lastAt:stamp()});
  batch.set(b.db.doc(`communityThreads/${id}/messages/${fake}`),{senderId:A,text:'Spoof',clientMessageId:fake,createdAt:stamp()});
  batch.update(b.db.doc(`communityThreads/${id}`),{lastText:'Spoof',lastMessageId:fake,lastSenderId:A,updatedAt:stamp()});await assertFails(batch.commit());
});
test('block in either direction stops new messages but preserves existing history',async()=>{
  const {a,b,id}=await thread(),msg=crypto.randomUUID();await a.s.sendMessage(id,'Before block',msg);await b.s.block(A);await clearGate(A);
  await assertFails(a.s.sendMessage(id,'Blocked',crypto.randomUUID()));await assertFails(b.s.sendMessage(id,'Also blocked',crypto.randomUUID()));
  await assertSucceeds(a.db.doc(`communityThreads/${id}/messages/${msg}`).get());
  await b.s.unblock(A);await assertSucceeds(a.s.sendMessage(id,'After unblock',crypto.randomUUID()));
});
test('unfriending revokes send permission without erasing history',async()=>{
  const {a,b,id}=await thread();await a.s.unfriend(B);await assertFails(b.s.sendMessage(id,'No longer friends',crypto.randomUUID()));
  await assertSucceeds(b.db.doc(`communityThreads/${id}`).get());
});
test('message rate gate is required and cannot be deleted or backdated',async()=>{
  const {a,id}=await thread();await a.s.sendMessage(id,'First',crypto.randomUUID());
  await assertFails(a.s.sendMessage(id,'Too fast',crypto.randomUUID()));
  await assertFails(a.db.doc('communityGates/alice/limits/message').delete());
  await assertFails(a.db.doc('communityGates/alice/limits/message').set({lastAt:firebase.firestore.Timestamp.fromMillis(1)}));
});
test('reports are private and release cannot be enabled from the frontend',async()=>{
  const {a,b,id}=await thread();await a.s.report({peer:B,threadId:id,reason:'spam',detail:'Repeated unsolicited messages'});
  let ids;await admin(async db=>{ids=(await db.collection('communityReports').get()).docs.map(d=>d.id);});
  await assertFails(b.db.doc('communityReports/'+ids[0]).get());await assertSucceeds(a.db.doc('communityReports/'+ids[0]).get());
  await assertFails(a.db.doc('communityConfig/release').set({enabled:true,version:1}));
});
test('pagination returns previous page without exposing messages to others',async()=>{
  const {a,b,id}=await thread();await admin(async db=>{const batch=db.batch();for(let i=0;i<36;i++)batch.set(db.doc(`communityThreads/${id}/messages/seed-${i}`),{senderId:A,text:'Message '+i,clientMessageId:'seed-'+i,createdAt:firebase.firestore.Timestamp.fromMillis(1000+i)});await batch.commit();});
  const first=await b.db.collection(`communityThreads/${id}/messages`).orderBy('createdAt','desc').limit(30).get();
  const second=await b.s.olderMessages(id,first.docs.at(-1));assert.equal(second.rows.length,6);assert.equal(second.rows[0].text,'Message 0');
});

test('reports cannot attribute another member’s message to an unrelated person',async()=>{
 const {a,b,id}=await thread(),msg=crypto.randomUUID();await a.s.sendMessage(id,'Evidence',msg);
 await assertFails(a.s.report({peer:C,threadId:id,reason:'abuse'}));
 await assertFails(a.s.report({peer:B,threadId:id,messageId:msg,reason:'abuse'}));
 await assertSucceeds(b.s.report({peer:A,threadId:id,messageId:msg,reason:'abuse'}));
});
