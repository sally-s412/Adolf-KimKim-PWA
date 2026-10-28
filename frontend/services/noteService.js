/* ============================================================
   noteService.js
   Contract:
     watchNotes(cb) -> unsubscribe()
     createNote(title) -> Promise<id>
     updateNote(id, data) -> Promise<void>
     deleteNote(id) -> Promise<void>
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;

  function watchNotes(cb, onError) {
    const col = FC.userCol('notes');
    if (!col) { cb([]); return () => {}; }
    return col.orderBy('createdAt', 'desc').onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error('notes listener', err); if (onError) onError(err); }
    );
  }

  async function createNote(title) {
    const col = FC.userCol('notes');
    if (!col) throw new Error('Chưa đăng nhập.');
    const ref = await col.add({ title: title || 'Untitled note', content: '', createdAt: FC.serverTimestamp() });
    return ref.id;
  }

  async function updateNote(id, data) {
    const col = FC.userCol('notes');
    if (!col) throw new Error('Chưa đăng nhập.');
    await col.doc(id).set(data, { merge: true });
  }

  async function deleteNote(id) {
    const col = FC.userCol('notes');
    if (!col) throw new Error('Chưa đăng nhập.');
    await col.doc(id).delete();
  }

  global.NoteService = { watchNotes, createNote, updateNote, deleteNote };
})(window);
