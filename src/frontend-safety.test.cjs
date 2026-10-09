const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const vm = require('node:vm');
const read = file => readFileSync(path.join(__dirname, file), 'utf8');

test('startup purges all legacy answer generations without deleting user sessions', () => {
  const entries = new Map(['dash-ans-g10:price', 'dash-ans-g1:old', 'dash-sem:old', 'dash-sessions-user'].map(k => [k, 'data']));
  const context = { module: { exports: {} }, console, localStorage: {
    get length() { return entries.size; }, key: i => [...entries.keys()][i], removeItem: k => entries.delete(k),
  } };
  vm.runInNewContext(transformSync(read('services/cacheGen.ts'), { loader: 'ts', format: 'cjs' }).code, context);
  context.module.exports.purgeStaleAnswerCaches();
  assert.deepEqual([...entries.keys()], ['dash-sessions-user']);
});

test('login does not publish shared demo credentials or autofill', () => {
  assert.doesNotMatch(read('components/LoginPage.tsx'), /H000|Demo Account|setDemoTutup/);
});

test('demo password UI is guarded and explicitly not a security boundary', () => {
  const dialog = read('components/ChangePasswordDialog.tsx');
  assert.match(dialog, /isDemoAccount/);
  assert.match(dialog, /if \(isDemo\) return/);
  assert.match(dialog, /bukan pengamanan API/);
});

test('normal demo chat has no obsolete denial or question-cap notice', () => {
  for (const file of ['lib/errorMessage.ts', 'components/Sidebar.tsx', 'components/ChangePasswordDialog.tsx']) {
    assert.doesNotMatch(read(file), /DEMO_LIMIT|DEMO_UNAVAILABLE|10 pertanyaan per hari|demo publik ditunda/i);
  }
});

test('offline sends never auto replay into another account or session', () => {
  assert.doesNotMatch(read('hooks/useChat.ts'), /setQueued|type Queued/);
  assert.doesNotMatch(read('App.tsx'), /terkirim otomatis/);
  assert.match(read('components/MessageInput.tsx'), /if \(!accepted\) return/);
});

test('failed partial answer is removed before a later successful turn can persist it', () => {
  assert.match(read('hooks/useChat.ts'), /filter\(m => m\.id !== assistantId\)/);
});

test('viewport permits zoom and editable inputs use 16px', () => {
  assert.doesNotMatch(read('../index.html'), /maximum-scale|user-scalable/);
  for (const file of ['LoginPage', 'ChangePasswordDialog', 'MessageInput']) {
    assert.match(read(`components/${file}.tsx`), /text-\[16px\]/);
  }
});
