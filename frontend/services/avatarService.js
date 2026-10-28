/* ============================================================
   avatarService.js
   Contract:
     uploadAvatar(file) -> Promise<url>   uploads to Storage, updates
                                           auth profile + users/{uid}.avatarUrl
   Swap the body of uploadAvatar for a REST multipart call later —
   UI (handleAvatarSelected) never touches Storage/Firestore directly.
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;
  const MAX_BYTES = 5 * 1024 * 1024;

  function validate(file) {
    if (!file) return (typeof t === 'function' ? t('errNoFile') : 'Không có file nào được chọn.');
    if (!file.type.startsWith('image/')) return (typeof t === 'function' ? t('errInvalidImageType') : 'Chỉ hỗ trợ file ảnh (jpg, png, webp...).');
    if (file.size > MAX_BYTES) return (typeof t === 'function' ? t('errFileTooLarge') : 'Ảnh vượt quá dung lượng cho phép (5MB).');
    return null;
  }

  // Resize/re-encode any input image to a JPEG blob capped at maxDim px on
  // the long edge. This avoids storage/unknown errors caused by huge
  // originals, unsupported formats (HEIC, etc.), or broken EXIF orientation.
  function resizeToJpeg(file, maxDim) {
    maxDim = maxDim || 512;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
            else { width = Math.round(width * (maxDim / height)); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            URL.revokeObjectURL(url);
            if (!blob) return reject(new Error(typeof t === 'function' ? t('errImageProcessFailed') : 'Không xử lý được ảnh.'));
            resolve(blob);
          }, 'image/jpeg', 0.88);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(typeof t === 'function' ? t('errImageProcessFailed') : 'Không đọc được ảnh.')); };
      img.src = url;
    });
  }

  function friendlyStorageError(err) {
    const code = err && err.code ? err.code : '';
    const base = (typeof t === 'function' ? t('errAvatarUploadFailed') : 'Tải ảnh đại diện thất bại') + (code ? ' (' + code + ')' : '') + ': ' + (err && err.message ? err.message : err);
    const hint = typeof t === 'function' ? t('errStorageCheckHint') : 'Kiểm tra: đã bật Cloud Storage cho project, đúng storageBucket trong cấu hình, và đã deploy storage.rules cho phép user ghi vào avatars/{uid}/.';
    return base + '\n' + hint;
  }

  async function uploadAvatar(file) {
    const err = validate(file);
    if (err) throw new Error(err);
    const user = firebase.auth().currentUser;
    if (!user || !FC.storage) throw new Error(typeof t === 'function' ? t('notLoggedIn') : 'Chưa đăng nhập.');
    let blob;
    try {
      blob = await resizeToJpeg(file, 512);
    } catch (e) {
      // Fall back to the original file if resizing fails for any reason
      // (e.g. unsupported browser API) rather than blocking the upload.
      blob = file;
    }
    const ref = FC.storage.ref().child('avatars/' + user.uid + '/avatar.jpg');
    try {
      await ref.put(blob, { contentType: 'image/jpeg' });
    } catch (e) {
      throw new Error(friendlyStorageError(e));
    }
    const url = await ref.getDownloadURL();
    await user.updateProfile({ photoURL: url });
    if (FC.db) await FC.db.collection('users').doc(user.uid).set({ avatarUrl: url }, { merge: true });
    return url;
  }

  global.AvatarService = { uploadAvatar, validate };
})(window);
