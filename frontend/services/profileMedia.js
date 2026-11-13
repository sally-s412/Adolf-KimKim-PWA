/* Public avatar/cover uploads. Keys remain on the backend. Never use for chat. */
(function(global){
 'use strict';
 const messages={
  'media/not-configured':['Dịch vụ ảnh chưa được kết nối. Bạn vẫn có thể chọn ảnh bìa có sẵn.','Image storage is not connected yet. Built-in covers remain available.'],
  'media/sign-in':['Vui lòng đăng nhập lại để tải ảnh.','Please sign in again to upload an image.'],
  'media/rate-limit':['Bạn vừa tải ảnh lên. Hãy chờ 10 giây rồi thử lại.','Please wait 10 seconds before another upload.'],
  'media/upload-timeout':['Tải ảnh quá thời gian. Vui lòng thử lại.','Image upload timed out. Please retry.'],
  'media/canceled':['Đã huỷ tải ảnh.','Image upload canceled.'],
  'media/invalid-image':['Không đọc được ảnh. Hãy chọn JPG, PNG hoặc WebP khác.','Cannot read this image. Choose another JPG, PNG or WebP.'],
  'media/too-large':['Ảnh sau xử lý vượt quá 2 MB. Hãy chọn ảnh nhỏ hơn.','Processed image exceeds 2 MB. Choose a smaller image.']
 };
 function message(err){const en=typeof lang!=='undefined'&&lang==='en';return (messages[err?.code]||['Chưa tải được ảnh. Vui lòng thử lại sau.','Could not upload the image. Please try again later.'])[en?1:0];}
 function error(code){return Object.assign(new Error(message({code})),{code});}
 function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='res.cloudinary.com'&&!u.search&&!u.hash&&/^\/[a-z0-9-]+\/image\/upload\/v[0-9]+\/kimkim\/(avatars|covers)\/[a-zA-Z0-9_-]{1,128}\/(avatar|cover)\.jpg$/.test(u.pathname);}catch{return false;}}
 function upload(blob,purpose,onProgress=()=>{}){
  let xhr,aborted=false;
  const promise=(async()=>{
   if(!['cover','avatar'].includes(purpose)||blob.type!=='image/jpeg')throw error('media/invalid-image');
   if(blob.size>2*1024*1024)throw error('media/too-large');
   const user=global.firebase.auth().currentUser;if(!user)throw error('media/sign-in');
   const uid=user.uid,token=await user.getIdToken();if(aborted)throw error('media/canceled');
   const base=String(global.AKK_CONFIG?.apiBaseUrl||'').replace(/\/$/,'');
   return new Promise((resolve,reject)=>{
    xhr=new XMLHttpRequest();xhr.open('POST',base+'/api/profile-media/'+purpose);xhr.timeout=45000;
    xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type','image/jpeg');
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};
    xhr.onerror=()=>reject(error('media/network'));xhr.ontimeout=()=>reject(error('media/upload-timeout'));xhr.onabort=()=>reject(error('media/canceled'));
    xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(error('media/provider-unavailable'));return;}
     if(xhr.status<200||xhr.status>=300){reject(error(typeof data.detail==='string'?data.detail:'media/provider-unavailable'));return;}
     if(aborted||global.firebase.auth().currentUser?.uid!==uid){reject(error('media/sign-in'));return;}
     if(!safeURL(data.url)){reject(error('media/provider-unavailable'));return;}resolve(data.url);
    };xhr.send(blob);
   });
  })();
  return {promise,cancel(){aborted=true;xhr?.abort();}};
 }
 global.ProfileMedia={upload,safeURL,message};
})(window);
