const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/app.js', 'utf8');

test('documents go to the extraction API and retain content for summary/chat', async () => {
  const requests = [], saved = [];
  const row = {};
  const context = {lang: 'vi', FormData: function() { this.append = () => {}; }, getApiUrl: () => 'https://backend.example',
    getSpeakerColor: () => '#3b82f6', apiFetch: async (...args) => { requests.push(args); return {json: async () => ({
      kind: 'pdf', page_count: 1, character_count: 14, sections: [{text: 'Văn bản gốc', page: 1}]
    })}; }, addProcessedMeeting: async (...args) => saved.push(args)};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function importDocumentFile('), source.indexOf('async function audioBufferTo16kPcm(')), context);
  await context.importDocumentFile({name: 'Tài liệu.pdf'}, row);
  assert.equal(requests[0][0], 'https://backend.example/api/documents/extract');
  assert.equal(requests[0][1].headers['Accept-Language'], 'vi');
  assert.equal(saved[0][0], 'Tài liệu');
  assert.equal(saved[0][1][0].text, 'Văn bản gốc');
  assert.equal(saved[0][1][0].speaker, 'DOCUMENT');
  assert.equal(saved[0][3].kind, 'pdf');
});

test('document metadata persists with the same per-user meeting ownership', async () => {
  let written;
  const window = {FirebaseClient: {userCol: name => { assert.equal(name, 'meetings'); return {add: async data => {written = data; return {id: 'doc-1'};}}; }, serverTimestamp: () => 1}};
  const context = {window}; vm.createContext(context);
  vm.runInContext(fs.readFileSync('frontend/services/meetingService.js', 'utf8'), context);
  await window.MeetingService.createMeeting({title: 'Tài liệu', document: {kind: 'docx'}, transcript: [{text: 'Nguyên văn'}]});
  assert.equal(written.document.kind, 'docx');
  assert.equal(written.transcript[0].text, 'Nguyên văn');
});

test('document view shows text and pages without inventing speakers or timecodes', () => {
  const nodes = {segList: {}, speakerStats: {innerHTML: 'stale stats'}};
  const context = {currentMeetingObj: {document: {kind: 'pdf'}}, segments: [{text: '<b>Nội dung</b>', page: 2}], lang: 'vi',
    document: {getElementById: id => nodes[id]}, escapeHtml: s => s.replaceAll('<', '&lt;').replaceAll('>', '&gt;')};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function renderTranscriptAndStats('), source.indexOf('function fmt(')), context);
  context.renderTranscriptAndStats();
  assert.match(nodes.segList.innerHTML, /Trang 2/);
  assert.match(nodes.segList.innerHTML, /&lt;b&gt;/);
  assert.doesNotMatch(nodes.segList.innerHTML, /SPEAKER_|0:00/);
  assert.equal(nodes.speakerStats.innerHTML, '');
});
