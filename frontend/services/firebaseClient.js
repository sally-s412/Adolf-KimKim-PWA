/* ============================================================
   firebaseClient.js
   Single place that owns the Firebase SDK instances.
   Every service below reads db/auth/storage/ready from here.
   Swapping Firebase for a REST backend later = rewrite this file
   (and the *Service.js files) — UI code never touches this.
   ============================================================ */
(function (global) {
  const firebaseConfig = {
    apiKey: "AIzaSyD6opc9sUjmdSjCY9Vfs1ceUYZRE8Ou1vs",
    authDomain: "adolfkimkim.firebaseapp.com",
    projectId: "adolfkimkim",
    storageBucket: "adolfkimkim.firebasestorage.app",
    messagingSenderId: "854811459406",
    appId: "1:854811459406:web:4ab496111eace1b4c4681f"
  };

  let ready = false;
  let db = null;
  let storage = null;

  try {
    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      storage = firebase.storage();
      ready = true;
    }
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }

  function uid() {
    return firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
  }

  /** Convenience accessor for a per-user Firestore collection: users/{uid}/{name} */
  function userCol(name) {
    const u = uid();
    if (!db || !u) return null;
    return db.collection('users').doc(u).collection(name);
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  global.FirebaseClient = { get ready() { return ready; }, get db() { return db; }, get storage() { return storage; }, uid, userCol, serverTimestamp };
})(window);
