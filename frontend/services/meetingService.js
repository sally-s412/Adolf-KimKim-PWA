/* ============================================================
   meetingService.js
   Contract:
     watchMeetings(cb) -> unsubscribe()          realtime list
     getMeeting(id) -> Promise<meeting|null>
     createMeeting(data) -> Promise<id>
     updateMeeting(id, data) -> Promise<void>
     deleteMeeting(id) -> Promise<void>
   Meeting shape: { id, title, date, time, dur, status, participants:[],
                    description, transcript:[], summary, keyPoints:[],
                    actionItems:[], notes, createdAt }
   status: 'progress' | 'processing' | 'done'
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;

  function watchMeetings(cb, onError) {
    const col = FC.userCol('meetings');
    if (!col) { cb([]); return () => {}; }
    return col.orderBy('createdAt', 'desc').onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error('meetings listener', err); if (onError) onError(err); }
    );
  }

  async function getMeeting(id) {
    const col = FC.userCol('meetings');
    if (!col) return null;
    const snap = await col.doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  async function createMeeting(data) {
    const col = FC.userCol('meetings');
    if (!col) throw new Error('Chưa đăng nhập.');
    const ref = await col.add({
      title: data.title || 'Untitled meeting',
      date: data.date || '',
      time: data.time || '',
      dur: data.dur || '00:00',
      status: data.status || 'processing',
      participants: data.participants || [],
      description: data.description || '',
      transcript: data.transcript || [],
      summary: '',
      keyPoints: [],
      actionItems: [],
      notes: '',
      ...(data.document ? {document: data.document} : {}),
      createdAt: FC.serverTimestamp()
    });
    return ref.id;
  }

  async function updateMeeting(id, data) {
    const col = FC.userCol('meetings');
    if (!col) throw new Error('Chưa đăng nhập.');
    await col.doc(id).set(data, { merge: true });
  }

  async function deleteMeeting(id) {
    const col = FC.userCol('meetings');
    if (!col) throw new Error('Chưa đăng nhập.');
    await col.doc(id).delete();
  }

  global.MeetingService = { watchMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting };
})(window);
