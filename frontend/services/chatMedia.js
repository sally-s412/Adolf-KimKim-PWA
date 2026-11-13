/* Private image transport. Blob URLs are session scoped and never written to Firestore. */
(function(g){
 const base=()=>String(g.AKK_CONFIG?.apiBaseUrl||'').replace(/\/$/,'');
 const fail=(code)=>Object.assign(new Error(g.ProfileMedia.message({code})),{code});
 async function jpeg(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw fail('media/invalid-image');
  return new Promise((resolve,reject)=>{const img=new Image(),u=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(u);if(img.width*img.height>16000000){reject(fail('media/too-large'));return;}const scale=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b&&b.size<=2*1024*1024?resolve(b):reject(fail('media/too-large')),'image/jpeg',.84);};img.onerror=()=>{URL.revokeObjectURL(u);reject(fail('media/invalid-image'));};img.src=u;});
 }
 async function request(path,options={}){const user=g.firebase.auth().currentUser;if(!user)throw fail('media/sign-in');const uid=user.uid,token=await user.getIdToken(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{const response=await fetch(base()+'/api/chat-media/'+path,{...options,signal:controller.signal,headers:{Authorization:'Bearer '+token,...options.headers}});if(g.firebase.auth().currentUser?.uid!==uid)throw fail('media/sign-in');if(!response.ok){let data={};try{data=await response.json();}catch{}throw fail(typeof data.detail==='string'?data.detail:'media/provider-unavailable');}return response;}catch(e){if(e.name==='AbortError')throw fail('media/upload-timeout');throw e;}finally{clearTimeout(timer);}
 }
 const upload=async(thread,id,blob)=>(await (await request(encodeURIComponent(thread)+'/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob})).json()).mediaId;
 const read=async(thread,id)=>{const r=await request(encodeURIComponent(thread)+'/'+encodeURIComponent(id));return r.blob();};
 g.ChatMedia={jpeg,upload,read};
})(window);
