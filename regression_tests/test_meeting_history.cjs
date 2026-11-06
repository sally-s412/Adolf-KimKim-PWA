const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const state = {stops: [], errors: [], updates: []};
  const doc = {
    collection(name) {
      assert.equal(name, 'chatMessages');
      return {
        orderBy() { return this; }, limit() { return this; },
        onSnapshot(ok, fail) { state.primary = {ok, fail}; return () => state.stops.push('primary'); },
        async add(message) {
          state.sent = message;
          if (state.writeError) throw state.writeError;
          return {id: 'message-1'};
        }
      };
    },
    onSnapshot(ok, fail) { state.fallback = {ok, fail}; return () => state.stops.push('fallback'); },
    async update(data) { state.updates.push(data); if (state.parentWriteError) throw state.parentWriteError; }
  };
  const window = {
    FirebaseClient: {
      userCol(name) { assert.equal(name, 'meetings'); return {doc(id) { assert.equal(id, 'meeting-1'); return doc; }}; },
      serverTimestamp: () => 'server-time'
    },
    firebase: {firestore: {FieldValue: {arrayUnion: value => ({union: value})}}}
  };
  const context = {window, console}; vm.createContext(context);
  vm.runInContext(fs.readFileSync('frontend/services/aiService.js', 'utf8'), context);
  return {state, ai: window.AiService};
}

test('permission denial reads existing meeting history, with no broadened access', () => {
  const {state, ai} = fixture(); const rows = [], errors = [];
  const stop = ai.watchMeetingChat('meeting-1', value => rows.push(value), error => errors.push(error));
  state.primary.fail({code: 'permission-denied'});
  const history = [{role: 'user', text: 'Tiếng Việt'}];
  state.fallback.ok({exists: true, data: () => ({chatHistory: history})});
  assert.deepEqual(rows, [history]); assert.deepEqual(errors, []);
  stop(); assert.deepEqual(state.stops, ['primary', 'fallback']);
  state.fallback.ok({exists: true, data: () => ({chatHistory: []})});
  assert.equal(rows.length, 1);
});
test('unsubscribe prevents a late permission error from starting another listener', () => {
  const {state, ai} = fixture(); const stop = ai.watchMeetingChat('meeting-1', () => {});
  stop(); state.primary.fail({code: 'permission-denied'}); assert.equal(state.fallback, undefined);
});
test('an unrelated Firebase error is reported without a permission fallback', () => {
  const {state, ai} = fixture(); const errors = [];
  ai.watchMeetingChat('meeting-1', () => {}, error => errors.push(error));
  const err = {code: 'unavailable'}; state.primary.fail(err);
  assert.equal(state.fallback, undefined); assert.deepEqual(errors, [err]);
});
test('failure of both authorized paths is surfaced without erasing cached history', () => {
  const {state, ai} = fixture(); const rows = [], errors = [];
  ai.watchMeetingChat('meeting-1', value => rows.push(value), error => errors.push(error));
  state.primary.fail({code: 'permission-denied'});
  state.fallback.fail({code: 'permission-denied'});
  assert.equal(errors.length, 1); assert.deepEqual(rows, []);
});
test('denied duplicate chat write uses atomic history append; unrelated failures propagate', async () => {
  const {state, ai} = fixture(); state.writeError = {code: 'permission-denied'};
  await ai.addMeetingChatMessage('meeting-1', 'agent', 'Original AI reply');
  assert.equal(state.updates[0].chatHistory.union.text, 'Original AI reply');
  assert.equal(state.updates[0].chatHistory.union.role, 'agent');
  state.writeError = new Error('offline');
  await assert.rejects(ai.addMeetingChatMessage('meeting-1', 'user', 'hi'), /offline/);
  assert.equal(state.updates.length, 1);
});
test('speech failures are readable in VI/EN and other API details remain intact', () => {
  const source = fs.readFileSync('frontend/app.js', 'utf8');
  const helper = source.slice(source.indexOf('function apiErrorMessage('), source.indexOf('async function apiFetch('));
  const context = {lang: 'vi'}; vm.createContext(context); vm.runInContext(helper, context);
  assert.match(context.apiErrorMessage(503, 'port 2609', '/api/transcribe'), /server AI/);
  assert.doesNotMatch(context.apiErrorMessage(503, 'port 2609', '/transcribe'), /2609/);
  context.lang = 'en'; assert.match(context.apiErrorMessage(503, 'port 2609', '/api/transcribe'), /back online/);
  assert.match(context.apiErrorMessage(504, '', '/transcribe'), /timed out/);
  assert.equal(context.apiErrorMessage(400, 'Original validation detail', '/api/chat'), 'Original validation detail');
});
