/* ============================================================
   teamService.js
   Contract:
     watchMembers(cb) -> unsubscribe()
     inviteMember(email) -> Promise<id>      creates status='pending' record only
     removeMember(id) -> Promise<void>
     changeRole(id, role) -> Promise<void>
   No real email is sent (no email service available in this
   environment) — invitation is just a Firestore record.
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;
  const COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#a855f7'];

  function watchMembers(cb, onError) {
    const col = FC.userCol('team');
    if (!col) { cb([]); return () => {}; }
    return col.onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error('team listener', err); if (onError) onError(err); }
    );
  }

  async function inviteMember(email) {
    const col = FC.userCol('team');
    if (!col) throw new Error('Chưa đăng nhập.');
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const ref = await col.add({
      name: email.split('@')[0], email, role: 'member', status: 'pending', color,
      createdAt: FC.serverTimestamp()
    });
    return ref.id;
  }

  async function removeMember(id) {
    const col = FC.userCol('team');
    if (!col) throw new Error('Chưa đăng nhập.');
    await col.doc(id).delete();
  }

  async function changeRole(id, role) {
    const col = FC.userCol('team');
    if (!col) throw new Error('Chưa đăng nhập.');
    await col.doc(id).set({ role }, { merge: true });
  }

  global.TeamService = { watchMembers, inviteMember, removeMember, changeRole };
})(window);
