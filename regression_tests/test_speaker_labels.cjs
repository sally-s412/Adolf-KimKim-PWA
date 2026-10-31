const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/app.js', 'utf8');
const mapping = source.slice(source.indexOf('function mapSpeakerName('), source.indexOf('// Stable deployment endpoints.'));
function context(extra = {}) {
  const ctx = {...extra}; vm.createContext(ctx); vm.runInContext(mapping, ctx); return ctx;
}
test('STT identities remain unchanged and are never assigned sample human names', () => {
  const ctx = context();
  for (const label of ['SPEAKER_00', 'SPEAKER_01', 'SPEAKER_02', 'SPEAKER_17', 'Ngọc Anh', 'Miles', 'speaker-0']) {
    assert.equal(ctx.mapSpeakerName(label), label);
  }
  assert.equal(ctx.mapSpeakerName(0), '0');
  for (const empty of [undefined, null, '', '   ']) assert.equal(ctx.mapSpeakerName(empty), 'UNKNOWN');
  assert.notEqual(ctx.getSpeakerColor('SPEAKER_00'), ctx.getSpeakerColor('SPEAKER_01'));
  assert.equal(ctx.getSpeakerColor('SPEAKER_00'), ctx.getSpeakerColor('SPEAKER_00'));
});
test('uploaded transcript preserves actual speakers, text and request contract', async () => {
  const requests = [];
  const payload = {segments: [
    {speaker: 'SPEAKER_00', start: 1.5, text: 'Câu một'},
    {speaker: 'SPEAKER_01', start: 3, text: 'Câu hai'},
    {speaker: 'Ngọc Anh', start: 4, text: 'Tên thực'},
    {speaker: 0, start: 5, text: 'Zero'},
    {speaker_id: 'SPEAKER_08', start: 6, text: 'ID'},
    {start: 7, text: 'Không rõ người nói'}
  ]};
  const form = {append() {}};
  const ctx = context({FormData: function() { return form; }, getApiUrl: () => 'https://backend.example',
    apiFetch: async (...args) => { requests.push(args); return {ok: true, json: async () => payload}; }});
  vm.runInContext(source.slice(source.indexOf('async function transcribeAudioBlob('), source.indexOf('// Override saveRecording')), ctx);
  const rows = await ctx.transcribeAudioBlob({name: 'test.wav'});
  assert.deepEqual(Array.from(rows, row => row.speaker), ['SPEAKER_00', 'SPEAKER_01', 'Ngọc Anh', '0', 'SPEAKER_08', 'UNKNOWN']);
  assert.deepEqual(Array.from(rows, row => row.text), payload.segments.map(row => row.text));
  assert.equal(requests[0][0], 'https://backend.example/api/transcribe');
  assert.equal(requests[0][1].method, 'POST');
  assert.equal(requests[0][1].body, form);
});
test('live final STT speaker labels stay intact, including numeric zero', () => {
  const ctx = context({recordingSeconds: 12, segments: [], lastFinalText: '', livePartialText: '', renderTranscriptAndStats() {}});
  const start = source.indexOf('function handleSTTMessage(');
  assert.ok(start >= 0, 'STT handler exists');
  vm.runInContext(source.slice(start, source.indexOf('function renderTranscript()', start)), ctx);
  ctx.handleSTTMessage({type: 'transcript_final', speaker: 'SPEAKER_01', text: 'Hello'});
  ctx.handleSTTMessage({type: 'transcript_final', speaker: 0, text: 'Again'});
  assert.deepEqual(Array.from(ctx.segments, row => row.speaker), ['SPEAKER_01', '0']);
});
