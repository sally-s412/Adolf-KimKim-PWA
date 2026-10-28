/* ============================================================
   uploadService.js

   Firebase Storage is NOT available in this environment, so we
   never pretend to upload to real cloud storage. Instead we
   expose a stable abstraction:

       uploadApi.uploadFile(file, { onProgress }) -> Promise<{ url, path }>

   Today it's backed by a "local mock adapter" (simulated progress,
   object URL). Later a BE/AI engineer can swap MOCK_ADAPTER for a
   real REST adapter (e.g. POST /uploads) WITHOUT touching the UI,
   because the UI only ever calls UploadService.* below.
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;

  const ALLOWED_TYPES = ['audio/', 'video/'];
  const ALLOWED_EXACT = ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
  const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB prototype limit

  function validateFile(file) {
    if (!file) return 'Không có file nào được chọn.';
    const okType = ALLOWED_TYPES.some(t => file.type.startsWith(t)) || ALLOWED_EXACT.includes(file.type);
    if (!okType) return 'Chỉ hỗ trợ file âm thanh, video, PDF hoặc Word (mp3, wav, mp4, pdf, docx...).';
    if (file.size > MAX_SIZE_BYTES) return 'File vượt quá dung lượng cho phép (500MB).';
    return null;
  }

  /** Mock adapter: simulates a network upload with progress events. */
  const mockAdapter = {
    uploadFile(file, { onProgress } = {}) {
      return new Promise((resolve, reject) => {
        let pct = 0;
        const willFail = false; // deterministic for prototype; real adapter reports real failures
        const timer = setInterval(() => {
          pct += Math.random() * 25 + 10;
          if (pct >= 100) {
            pct = 100;
            clearInterval(timer);
            onProgress && onProgress(100);
            if (willFail) reject(new Error('Upload thất bại (mô phỏng).'));
            else resolve({ url: URL.createObjectURL(file), path: 'local-mock/' + Date.now() + '_' + file.name });
          } else {
            onProgress && onProgress(Math.round(pct));
          }
        }, 250);
      });
    }
  };

  // Swap this single line to point at a real REST adapter later.
  const uploadApi = mockAdapter;

  function watchUploads(cb, onError) {
    const col = FC.userCol('uploads');
    if (!col) { cb([]); return () => {}; }
    return col.orderBy('createdAt', 'desc').onSnapshot(
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error('uploads listener', err); if (onError) onError(err); }
    );
  }

  async function uploadFile(file) {
    if (typeof global.handleFileSelected === 'function') {
      return global.handleFileSelected(file);
    }
    const error = validateFile(file);
    const col = FC.userCol('uploads');
    if (!col) throw new Error('Chưa đăng nhập.');

    if (error) {
      await col.add({ name: file ? file.name : 'unknown', progressPct: 0, status: 'error', errorMessage: error, createdAt: FC.serverTimestamp() });
      throw new Error(error);
    }

    const ref = await col.add({ name: file.name, progressPct: 0, status: 'uploading', createdAt: FC.serverTimestamp() });
    try {
      const result = await uploadApi.uploadFile(file, {
        onProgress: pct => col.doc(ref.id).update({ progressPct: pct })
      });
      await col.doc(ref.id).update({ progressPct: 100, status: 'done', url: result.url, path: result.path });
      return ref.id;
    } catch (err) {
      await col.doc(ref.id).update({ status: 'error', errorMessage: err.message });
      throw err;
    }
  }

  global.UploadService = { watchUploads, uploadFile, validateFile };
})(window);
