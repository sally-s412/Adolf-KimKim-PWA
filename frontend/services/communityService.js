/* Beta social data only. No AI prompts, credentials or inference calls.
 * Every authorization decision is enforced by firebase/community.rules.fragment.
 * No Firestore persistence is enabled for private conversations on shared devices. */
(function (global) {
  'use strict';
  const FC = global.FirebaseClient;
  const col = name => FC.db.collection('community' + name);
  const stamp = () => FC.serverTimestamp();
  const uid = () => { const id=FC.uid(); if(!id) throw new Error('community/sign-in'); return id; };
  const pair = (a,b) => { if(!a||!b||a===b) throw new Error('community/invalid-peer'); return [a,b].sort().join('~'); };
  const data = snap => snap.exists ? {id:snap.id,...snap.data()} : null;
  const rows = snap => snap.docs.map(d=>({id:d.id,...d.data(),pendingWrite:!!d.metadata?.hasPendingWrites}));
  const gate = kind => col('Gates').doc(uid()).collection('limits').doc(kind);
  const profileRef = id => col('Profiles').doc(id);
  const normalizeHandle = value => String(value||'').trim().replace(/^@/,'').toLowerCase();

  async function saveProfile({name,handle,bio='',useGoogleAvatar=false,keepAvatar=true}) {
    const me=uid(); handle=normalizeHandle(handle); name=String(name||'').trim(); bio=String(bio||'').trim();
    if(!/^[a-z0-9_]{3,24}$/.test(handle))throw new Error('community/handle-format');
    if(name.length<2||name.length>80||bio.length>300)throw new Error('community/profile-format');
    const user=global.firebase.auth().currentUser;
    const photo=useGoogleAvatar&&/^https:\/\//.test(user.photoURL||'')?user.photoURL:'';
    return FC.db.runTransaction(async tx=>{
      const ref=profileRef(me),hr=col('Handles').doc(handle);
      const [old,owner]=await Promise.all([tx.get(ref),tx.get(hr)]);
      if(old.exists&&old.data().handle!==handle)throw new Error('community/handle-immutable');
      if(owner.exists&&owner.data().uid!==me)throw new Error('community/handle-taken');
      if(!owner.exists)tx.set(hr,{uid:me});
      const cover=old.exists?Object.fromEntries(['coverPreset','coverUrl'].filter(k=>Object.hasOwn(old.data(),k)).map(k=>[k,old.data()[k]])):{};
      tx.set(ref,{...cover,name,handle,bio,avatarUrl:useGoogleAvatar?photo:(keepAvatar&&old.exists?old.data().avatarUrl:''),createdAt:old.exists?old.data().createdAt:stamp(),updatedAt:stamp()});
    });
  }
  const getProfile=id=>profileRef(id).get().then(data);
  const watchRelease=(cb,fail)=>col('Config').doc('release').onSnapshot(s=>cb(s.exists&&s.data().enabled===true&&s.data().version===1),fail);
  const watchProfile=(id,cb,fail)=>profileRef(id).onSnapshot(s=>cb(data(s)),fail);
  async function search(handle){
    const term=normalizeHandle(handle);if(!/^[a-z0-9_]{2,24}$/.test(term))return [];
    return rows(await col('Profiles').orderBy('handle').startAt(term).endAt(term+'\uf8ff').limit(20).get());
  }
  const watchConnections=(cb,fail)=>col('Connections').where('members','array-contains',uid()).limit(50).onSnapshot(s=>cb(rows(s)),fail);
  async function invite(peer){
    const me=uid(),ref=col('Connections').doc(pair(me,peer));
    return FC.db.runTransaction(async tx=>{
      const old=await tx.get(ref);
      if(old.exists&&['pending','accepted'].includes(old.data().status))throw new Error('community/already-connected');
      tx.set(gate('invite'),{lastAt:stamp()});
      tx.set(ref,{members:[me,peer].sort(),senderId:me,status:'pending',createdAt:stamp(),updatedAt:stamp()});
    });
  }
  async function respond(peer,status){
    if(!['accepted','declined','cancelled'].includes(status))throw new Error('community/invalid-state');
    return col('Connections').doc(pair(uid(),peer)).update({status,updatedAt:stamp()});
  }
  const unfriend=peer=>col('Connections').doc(pair(uid(),peer)).delete();
  const watchBlocks=(cb,fail)=>col('Blocks').doc(uid()).collection('targets').onSnapshot(s=>cb(rows(s)),fail);
  const block=peer=>{const me=uid();pair(me,peer);return col('Blocks').doc(me).collection('targets').doc(peer).set({createdAt:stamp()});};
  const unblock=peer=>col('Blocks').doc(uid()).collection('targets').doc(peer).delete();
  const threadRef=peer=>col('Threads').doc(pair(uid(),peer));
  async function openThread(peer){
    const me=uid(),ref=threadRef(peer);
    await FC.db.runTransaction(async tx=>{
      const old=await tx.get(ref);if(old.exists)return;
      tx.set(ref,{members:[me,peer].sort(),createdAt:stamp(),updatedAt:stamp(),lastText:'',lastMessageId:'',lastSenderId:me});
    });
    return ref.id;
  }
  const watchThreads=(cb,fail)=>col('Threads').where('members','array-contains',uid()).limit(50).onSnapshot(s=>cb(rows(s).sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0))),fail);
  const messagesRef=id=>col('Threads').doc(id).collection('messages');
  const watchMessages=(id,cb,fail)=>messagesRef(id).orderBy('createdAt','desc').limit(30).onSnapshot(s=>cb(rows(s).reverse(),s.docs.at(-1)||null),fail);
  const olderMessages=async(id,cursor)=>{
    if(!cursor)return {rows:[],cursor:null};
    const snap=await messagesRef(id).orderBy('createdAt','desc').startAfter(cursor).limit(30).get();
    return {rows:rows(snap).reverse(),cursor:snap.docs.at(-1)||null};
  };
  const messageId=()=>global.crypto.randomUUID?global.crypto.randomUUID():Array.from(global.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  async function sendMessage(id,text,clientMessageId,mediaId=null){
    const me=uid(); text=String(text||'').trim();
    if((!text&&!mediaId)||text.length>2000||!/^[a-zA-Z0-9-]{20,80}$/.test(clientMessageId))throw new Error('community/message-format');
    const tr=col('Threads').doc(id),mr=messagesRef(id).doc(clientMessageId);
    // Transaction retries and explicit client retry share one document ID.
    return FC.db.runTransaction(async tx=>{
      const old=await tx.get(mr);
      if(old.exists){if(old.data().senderId!==me||old.data().text!==text||(old.data().mediaId||null)!==mediaId)throw new Error('community/message-conflict');return;}
      tx.set(gate('message'),{lastAt:stamp()});
      tx.set(mr,{senderId:me,text,clientMessageId,createdAt:stamp(),...(mediaId?{mediaId}:{})});
      tx.update(tr,{updatedAt:stamp(),lastText:text,lastMessageId:clientMessageId,lastSenderId:me});
    });
  }
  const markRead=id=>col('Threads').doc(id).collection('receipts').doc(uid()).set({readAt:stamp()});
  const watchReceipt=(id,cb,fail)=>col('Threads').doc(id).collection('receipts').doc(uid()).onSnapshot(s=>cb(data(s)),fail);
  const watchPeerReceipt=(id,peer,cb,fail)=>col('Threads').doc(id).collection('receipts').doc(peer).onSnapshot(s=>cb(data(s)),fail);
  const getReceipt=id=>col('Threads').doc(id).collection('receipts').doc(uid()).get().then(data);
  async function report({peer,threadId='',messageId='',reason,detail=''}){
    const me=uid();pair(me,peer);
    if(!['spam','abuse','other'].includes(reason)||detail.length>500)throw new Error('community/report-format');
    const batch=FC.db.batch();batch.set(gate('report'),{lastAt:stamp()});
    batch.set(col('Reports').doc(),{reporterId:me,peerId:peer,threadId,messageId,reason,detail,createdAt:stamp()});
    await batch.commit();
  }

  async function createGroup(name,members){
    const me=uid();name=String(name||'').trim();members=[...new Set([me,...members])].sort();
    if(name.length<2||name.length>60||members.length<3||members.length>4)throw new Error('community/group-format');
    const ref=col('Threads').doc('g-'+messageId());
    await ref.set({type:'group',name,ownerId:me,members,theme:'royal',createdAt:stamp(),updatedAt:stamp(),lastText:'',lastMessageId:'',lastSenderId:me});return ref.id;
  }
  const setTheme=(id,theme)=>col('Threads').doc(id).update({theme});
  const watchTyping=(id,cb,fail)=>col('Threads').doc(id).collection('typing').limit(6).onSnapshot(s=>cb(rows(s)),fail);
  const setTyping=(id)=>col('Threads').doc(id).collection('typing').doc(uid()).set({at:stamp()});
  const clearTyping=id=>col('Threads').doc(id).collection('typing').doc(uid()).delete();
  const watchReceipts=(id,cb,fail)=>col('Threads').doc(id).collection('receipts').limit(6).onSnapshot(s=>cb(rows(s)),fail);
  const notificationRef=()=>col('NotificationState').doc(uid());
  const watchNotificationState=(cb,fail)=>notificationRef().onSnapshot(s=>cb(s.exists?s.data().readAt?.toMillis?.()||0:0),fail);
  const readNotifications=()=>notificationRef().set({readAt:stamp()});

  global.CommunityService={createGroup,setTheme,watchTyping,setTyping,clearTyping,watchReceipts,watchNotificationState,readNotifications,pair,normalizeHandle,saveProfile,getProfile,watchRelease,watchProfile,search,watchConnections,invite,respond,unfriend,watchBlocks,block,unblock,openThread,watchThreads,watchMessages,olderMessages,messageId,sendMessage,markRead,watchReceipt,watchPeerReceipt,getReceipt,report};
})(window);
