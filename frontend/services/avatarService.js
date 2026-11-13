/* ============================================================
   avatarService.js
   Contract:
     uploadAvatar(file) -> Promise<url>   uploads via authenticated profile media API, updates
                                           auth profile + users/{uid}.avatarUrl
   Swap the body of uploadAvatar for a REST multipart call later —
   UI (handleAvatarSelected) never touches Storage/Firestore directly.
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;
  const MAX_BYTES = 5 * 1024 * 1024;

  function validate(file) {
    if (!file) return (typeof t === 'function' ? t('errNoFile') : 'Không có file nào được chọn.');
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return (typeof t === 'function' ? t('errInvalidImageType') : 'Chỉ hỗ trợ file ảnh (jpg, png, webp...).');
    if (file.size > MAX_BYTES) return (typeof t === 'function' ? t('errFileTooLarge') : 'Ảnh vượt quá dung lượng cho phép (5MB).');
    return null;
  }

  async function uploadAvatar(file) {
    const err = validate(file);
    if (err) throw new Error(err);
    const user = firebase.auth().currentUser;
    if (!user) throw new Error(typeof t === 'function' ? t('notLoggedIn') : 'Chưa đăng nhập.');
    const blob = await global.ImageCropper.open(file, {kind:'avatar'});
    if (!blob) return null;
    if (firebase.auth().currentUser?.uid !== user.uid) throw new Error('media/sign-in');
    const url = await global.ProfileMedia.upload(blob, 'avatar').promise;
    if (firebase.auth().currentUser?.uid !== user.uid) throw new Error('media/sign-in');
    await user.updateProfile({ photoURL: url });
    if (FC.db) await FC.db.collection('users').doc(user.uid).set({ avatarUrl: url }, { merge: true });
    if (FC.db) {
      const profile = FC.db.collection('communityProfiles').doc(user.uid);
      try { const old = await profile.get(); if (old.exists) await profile.update({avatarUrl:url,updatedAt:FC.serverTimestamp()}); }
      catch { /* Account avatar saved; social permissions may not yet be enabled. */ }
    }
    return url;
  }

  // Restore the user's chosen image if a subsequent Google sign-in refreshes
  // provider photoURL. The private users document is the persistent preference.
  if (FC.ready && global.AuthService) global.AuthService.onAuthChange(async user => {
    if (!user) return;
    const id=user.uid;
    try {
      const profile=await global.AuthService.getUserProfile();
      if (firebase.auth().currentUser?.uid !== id || !global.ProfileMedia?.safeURL(profile?.avatarUrl)) return;
      if (user.photoURL !== profile.avatarUrl) await user.updateProfile({photoURL:profile.avatarUrl});
      if (firebase.auth().currentUser?.uid === id && typeof updateUserUI === 'function') updateUserUI(user);
    } catch { /* Keep the current auth photo if the profile cannot be read. */ }
  });
  global.AvatarService = { uploadAvatar, validate };
})(window);

