/* ============================================================
   recordingService.js
   Real MediaRecorder-based capture. Produces a Blob which is
   uploaded through UploadService (same abstraction as file
   uploads), then a Meeting doc is created from it. Swappable
   for a server-side STT pipeline later — UI only calls the
   functions below.
   ============================================================ */
(function (global) {
  let mediaRecorder = null;
  let mediaStream = null;
  let chunks = [];
  let startedAt = null;
  let timerInt = null;
  let lastBlob = null;

  function fmtTimer(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  let lastStatusKey = null, lastStatusFallback = '';
  function setStatus(key, fallback) {
    lastStatusKey = key; lastStatusFallback = fallback;
    const el = document.getElementById('recStatus');
    if (el) el.textContent = (key && typeof I18N !== 'undefined' && I18N[lang][key]) ? I18N[lang][key] : fallback;
  }
  function refreshStatusLang() {
    if (lastStatusKey) setStatus(lastStatusKey, lastStatusFallback);
  }
  global.RecordingRefreshLang = refreshStatusLang;

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert(typeof t === 'function' ? t('recNoMic') : 'Microphone not available.');
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus('recPermDenied', 'Microphone permission denied.');
      return;
    }
    chunks = [];
    lastBlob = null;
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      lastBlob = new Blob(chunks, { type: 'audio/webm' });
      const preview = document.getElementById('recPreview');
      if (preview) { preview.src = URL.createObjectURL(lastBlob); preview.style.display = 'block'; }
      document.getElementById('recSaveBtn').style.display = 'inline-flex';
    };
    mediaRecorder.start();
    startedAt = Date.now();
    document.getElementById('recIcon').textContent = '⏺️';
    document.getElementById('recTimer').style.display = 'block';
    document.getElementById('recStartBtn').style.display = 'none';
    document.getElementById('recStopBtn').style.display = 'inline-flex';
    document.getElementById('recCancelBtn').style.display = 'inline-flex';
    document.getElementById('recSaveBtn').style.display = 'none';
    document.getElementById('recPreview').style.display = 'none';
    setStatus('recRecording', 'Recording...');
    timerInt = setInterval(() => {
      document.getElementById('recTimer').textContent = fmtTimer(Date.now() - startedAt);
    }, 250);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (mediaStream) mediaStream.getTracks().forEach(tr => tr.stop());
    clearInterval(timerInt);
    document.getElementById('recIcon').textContent = '🎙️';
    document.getElementById('recStopBtn').style.display = 'none';
    document.getElementById('recStartBtn').style.display = 'inline-flex';
    setStatus('recStopped', 'Recording stopped.');
  }

  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (mediaStream) mediaStream.getTracks().forEach(tr => tr.stop());
    clearInterval(timerInt);
    chunks = []; lastBlob = null;
    document.getElementById('recIcon').textContent = '🎙️';
    document.getElementById('recTimer').style.display = 'none';
    document.getElementById('recTimer').textContent = '00:00';
    document.getElementById('recStartBtn').style.display = 'inline-flex';
    document.getElementById('recStopBtn').style.display = 'none';
    document.getElementById('recCancelBtn').style.display = 'none';
    document.getElementById('recSaveBtn').style.display = 'none';
    document.getElementById('recPreview').style.display = 'none';
    setStatus('recCanceled', 'Recording canceled.');
  }

  async function saveRecording() {
    if (!lastBlob) return;
    if (typeof global.saveRecording === 'function' && global.saveRecording !== saveRecording) {
      return global.saveRecording();
    }
    setStatus('recUploading', 'Uploading recording...');
    const file = new File([lastBlob], 'recording-' + Date.now() + '.webm', { type: 'audio/webm' });
    try {
      await UploadService.uploadFile(file);
      const now = new Date();
      const id = await MeetingService.createMeeting({
        title: (typeof I18N !== 'undefined' && I18N[lang].recDefaultTitle ? I18N[lang].recDefaultTitle : 'Live recording') + ' ' + now.toLocaleString(),
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 5),
        status: 'processing'
      });
      setStatus('recSaved', 'Recording saved.');
      cancelRecording();
      showView('meetings', document.querySelector('[data-view=meetings]'));
      openMeeting(id);
    } catch (err) {
      setStatus(null, 'Upload failed: ' + err.message);
    }
  }

  global.RecordingService = { startRecording, stopRecording, cancelRecording, saveRecording, getLastBlob: () => lastBlob };
  global.startRecording = startRecording;
  global.stopRecording = stopRecording;
  global.cancelRecording = cancelRecording;
  global.saveRecording = saveRecording;
})(window);
