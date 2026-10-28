/* ============================================================
   authService.js
   UI never calls firebase.auth() directly — only these methods.
   Contract (kept stable so a future REST implementation is a
   drop-in replacement):
     signInEmail(email, password) -> Promise<User>
     signUpEmail(name, email, password) -> Promise<User>
     signInGoogle() -> Promise<User>
     sendPasswordReset(email) -> Promise<void>
     signOut() -> Promise<void>
     onAuthChange(cb) -> unsubscribe()
     ensureUserDoc(user) -> Promise<void>
     getUserProfile() -> Promise<{name,email,plan}>
     updateProfileName(name) -> Promise<void>
     changePassword(currentPassword, newPassword) -> Promise<void>
     deleteAccount() -> Promise<void>
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;

  function requireReady() {
    if (!FC.ready) {
      const err = new Error('Firebase chưa được cấu hình.');
      err.code = 'app/not-configured';
      throw err;
    }
  }

  function mapError(error) {
    const map = {
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/missing-password': 'Vui lòng nhập mật khẩu.',
      'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
      'auth/user-not-found': 'Không tìm thấy tài khoản này.',
      'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
      'auth/email-already-in-use': 'Email này đã được đăng ký.',
      'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
      'auth/popup-closed-by-user': 'Cửa sổ Google đã được đóng.',
      'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập Google.',
      'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase.',
      'auth/too-many-requests': 'Có quá nhiều lần thử. Hãy đợi một lúc rồi thử lại.',
      'app/not-configured': 'Bạn chưa cấu hình Firebase.'
    };
    const e = new Error(map[error.code] || error.message || 'Đã xảy ra lỗi đăng nhập.');
    e.code = error.code;
    return e;
  }

  async function signInEmail(email, password) {
    requireReady();
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      return cred.user;
    } catch (err) { throw mapError(err); }
  }

  async function signUpEmail(name, email, password) {
    requireReady();
    try {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await ensureUserDoc(cred.user);
      return cred.user;
    } catch (err) { throw mapError(err); }
  }

  async function signInGoogle() {
    requireReady();
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await firebase.auth().signInWithPopup(provider);
      try {
        await ensureUserDoc(cred.user);
      } catch (docErr) {
        console.warn("ensureUserDoc warning (non-fatal):", docErr);
      }
      return cred.user;
    } catch (err) {
      console.error("AuthService.signInGoogle error:", err);
      throw mapError(err);
    }
  }

  async function sendPasswordReset(email) {
    requireReady();
    try { await firebase.auth().sendPasswordResetEmail(email); }
    catch (err) { throw mapError(err); }
  }

  async function signOut() {
    if (!FC.ready) return;
    await firebase.auth().signOut();
  }

  function onAuthChange(cb) {
    if (!FC.ready) return () => {};
    return firebase.auth().onAuthStateChanged(cb);
  }

  async function ensureUserDoc(user) {
    if (!FC.db) return;
    const ref = FC.db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
        email: user.email || '',
        plan: 'free',
        createdAt: FC.serverTimestamp()
      });
    }
  }

  async function getUserProfile() {
    if (!FC.db || !FC.uid()) return null;
    const snap = await FC.db.collection('users').doc(FC.uid()).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  async function updateProfileName(name) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    await user.updateProfile({ displayName: name });
    await FC.db.collection('users').doc(user.uid).set({ name }, { merge: true });
  }

  async function changePassword(currentPassword, newPassword) {
    const user = firebase.auth().currentUser;
    if (!user) return;
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(newPassword);
    } catch (err) { throw mapError(err); }
  }

  async function deleteAccount() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    try {
      await FC.db.collection('users').doc(user.uid).delete();
      await user.delete();
    } catch (err) { throw mapError(err); }
  }

  global.AuthService = {
    signInEmail, signUpEmail, signInGoogle, sendPasswordReset, signOut,
    onAuthChange, ensureUserDoc, getUserProfile, updateProfileName,
    changePassword, deleteAccount
  };
})(window);
