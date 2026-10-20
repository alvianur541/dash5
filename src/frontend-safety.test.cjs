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

test('demo password UI guard retains concise copy (not an API security boundary)', () => {
  const dialog = read('components/ChangePasswordDialog.tsx');
  assert.match(dialog, /isDemoAccount/);
  assert.match(dialog, /if \(isDemo\) return/);
  assert.match(dialog, /Akun demo tidak bisa ubah password\./);
  assert.match(read('components/Sidebar.tsx'), /Akun demo tidak bisa ubah password\./);
  assert.doesNotMatch(dialog + read('components/Sidebar.tsx'), /dipakai bersama|bukan pengamanan API/);
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

test('PWA and mobile view are locked against pinch zoom and pull; editable inputs stay 16px', () => {
  assert.match(read('../index.html'), /maximum-scale=1(\.0)?, user-scalable=no/);
  assert.match(read('index.css'), /html \{[^}]*touch-action: pan-x pan-y;/);
  assert.match(read('lib/viewport.ts'), /gesturestart/);
  for (const file of ['LoginPage', 'ChangePasswordDialog']) {
    assert.match(read(`components/${file}.tsx`), /text-\[16px\]/);
  }
  // Composer is 15px by request (15 Oct); maximum-scale=1 above is what keeps iOS from zooming on focus.
  assert.match(read('components/MessageInput.tsx'), /text-\[15px\]/);
});

test('mobile sidebar drawer is sized by the app container, not the iOS initial containing block', () => {
  assert.match(read('App.tsx'), /<div className="relative flex h-full overflow-hidden/);
});

test('rich technical answers render only validated post-final payloads with responsive semantic cards', () => {
  const chat = read('components/ChatWindow.tsx');
  const card = read('components/AnswerPresentation.tsx');
  const css = read('index.css');
  assert.match(chat, /validateAnswerPresentation\(message\.presentation, message\.content\)/);
  assert.match(chat, /!isStreaming && presentation/);
  assert.match(chat, /<AnswerPresentation presentation=\{presentation\}/);
  assert.match(card, /<dl className="rich-facts">/);
  assert.match(card, /aria-label="Spesifikasi teknis terverifikasi"/);
  assert.match(card, /aria-label="Technical News terverifikasi"/);
  assert.match(css, /\.rich-card\s*\{/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.rich-card/);
  assert.match(read('main.tsx'), /import\.meta\.env\.DEV[\s\S]*fixture=rich-answers/);
});

test('only voice-originated user messages receive the microphone indicator', () => {
  const input = read('components/MessageInput.tsx');
  const chat = read('components/ChatWindow.tsx');
  const css = read('index.css');
  assert.match(input, /onSendMessage\(combined,[\s\S]*'voice'\)/);
  assert.match(chat, /message\.source === 'voice'/);
  assert.match(chat, /<Mic[^>]*className="voice-message-icon"/);
  assert.match(css, /\.voice-message-icon\s*\{/);
});
