/* ============================================================
   settingsService.js
   Contract:
     getSettings() -> Promise<{meetingLang,autoJoin,autoRecord,speechStyle,vocabDetect}>
     saveMeetingSettings(data) -> Promise<void>
     saveAISettings(data) -> Promise<void>
     getPlan() -> Promise<string>
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;
  const DEFAULTS = { meetingLang: 'vi', autoJoin: true, autoRecord: false, speechStyle: 'formal', vocabDetect: true };

  function ref() {
    const u = FC.uid();
    if (!FC.db || !u) return null;
    return FC.db.collection('users').doc(u).collection('settings').doc('general');
  }

  async function getSettings() {
    const r = ref();
    if (!r) return DEFAULTS;
    const snap = await r.get();
    return snap.exists ? { ...DEFAULTS, ...snap.data() } : DEFAULTS;
  }

  async function saveMeetingSettings(data) {
    const r = ref();
    if (!r) return;
    await r.set(data, { merge: true });
  }

  async function saveAISettings(data) {
    const r = ref();
    if (!r) return;
    await r.set(data, { merge: true });
  }

  async function getPlan() {
    const u = FC.uid();
    if (!FC.db || !u) return 'free';
    const snap = await FC.db.collection('users').doc(u).get();
    return snap.exists && snap.data().plan ? snap.data().plan : 'free';
  }

  global.SettingsService = { getSettings, saveMeetingSettings, saveAISettings, getPlan };
})(window);
