const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const source = fs.readFileSync('frontend/app.js', 'utf8');
const start = source.indexOf('function mapSpeakerName(');
const end = source.indexOf('// Hardcoded Cloudflare Tunnels', start);
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const exportStart = source.indexOf('async function readGeneratedFile(');
vm.runInContext(source.slice(exportStart, source.indexOf('async function requestGenerationHandler(', exportStart)), context);

test('engine speaker labels retain their identity at every index', () => {
  for (const label of ['SPEAKER_00', 'SPEAKER_01', 'SPEAKER_03', 'SPEAKER_04', 'SPEAKER_99']) {
    assert.equal(context.mapSpeakerName(label), label);
  }
});
test('real names from Meet are preserved; missing names remain unknown', () => {
  for (const name of ['Ngọc Anh', 'Miles', 'Sally', 'Người tham gia 7']) assert.equal(context.mapSpeakerName(name), name);
  for (const missing of [null, undefined, '']) assert.equal(context.mapSpeakerName(missing), 'Unknown');
});
test('live and uploaded transcripts no longer default to an invented name', () => {
  assert.doesNotMatch(source, /SPEAKER_NAMES|SPEAKER_COLORS/);
  assert.doesNotMatch(source, /(?:\|\||livePartialSpeaker\s*=)\s*["']Sally["']/);
  assert.equal(context.getSpeakerColor('SPEAKER_00'), context.getSpeakerColor('SPEAKER_00'));
});
test('export reader rejects HTTP errors and JSON masquerading as a file', async () => {
  let blobCalls = 0;
  for (const status of [200, 500]) {
    await assert.rejects(context.readGeneratedFile({ok: status === 200, status, headers: {get: () => 'application/json'}, json: async () => ({message: 'Export failed'}), blob: async () => {blobCalls++;}}), /Export failed/);
  }
  assert.equal(blobCalls, 0);
});
test('export reader accepts a real download', async () => {
  const file = {name: 'synthetic-document'};
  assert.equal(await context.readGeneratedFile({ok: true, status: 200, headers: {get: () => 'image/png'}, blob: async () => file}), file);
});
