const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const output = esbuild.buildSync({ entryPoints: ['src/lib/liveTranscript.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module('live-transcript'); mod._compile(output, 'live-transcript');
const { createLiveTranscript } = mod.exports;

test('live transcription chunks grow chat bubbles in turn order', () => {
  let n = 0;
  const t = createLiveTranscript(() => `id${++n}`, () => 1);
  assert.deepEqual(t.apply({ inputTranscription: { text: 'Tekanan ' } }).map(m => [m.id, m.role, m.content]), [['id1', 'user', 'Tekanan ']]);
  assert.deepEqual(t.apply({ inputTranscription: { text: 'pilot?' } }).map(m => m.content), ['Tekanan pilot?']);
  assert.deepEqual(t.apply({ outputTranscription: { text: 'Menurut' } }).map(m => [m.id, m.role]), [['id2', 'assistant']]);
  assert.deepEqual(t.apply({ outputTranscription: { text: ' manual…' } }).map(m => [m.id, m.content]), [['id2', 'Menurut manual…']]);
  assert.deepEqual(t.apply({ turnComplete: true }), []);
  assert.equal(t.apply({ inputTranscription: { text: 'Lalu?' } })[0].id, 'id3');
  assert.equal(t.apply({ outputTranscription: { text: 'Cek' } })[0].id, 'id4');
});

test('interruption closes the assistant bubble; next answer starts a new one', () => {
  let n = 0;
  const t = createLiveTranscript(() => `id${++n}`, () => 1);
  t.apply({ outputTranscription: { text: 'Panjang' } });
  t.apply({ interrupted: true });
  assert.equal(t.apply({ outputTranscription: { text: 'Baru' } })[0].id, 'id2');
});

test('tool answer replaces spoken transcript with exact digits and locks the turn', () => {
  let n = 0;
  const t = createLiveTranscript(() => `id${++n}`, () => 1);
  t.apply({ inputTranscription: { text: 'Harga track link?' } });
  t.apply({ outputTranscription: { text: 'Sebentar, saya cek dulu.' } });
  assert.deepEqual(t.answer('Harga `9248706HPB` Rp 22.447.800').map(m => [m.id, m.content]), [['id2', 'Harga `9248706HPB` Rp 22.447.800']]);
  assert.deepEqual(t.apply({ outputTranscription: { text: 'sembilan dua empat' } }), []);
  t.apply({ turnComplete: true });
  assert.equal(t.apply({ outputTranscription: { text: 'Ada lagi?' } })[0].id, 'id3');
});

test('tool answer without spoken text still creates an assistant bubble', () => {
  const t = createLiveTranscript(() => 'a1', () => 1);
  assert.deepEqual(t.answer('Rp 1').map(m => [m.role, m.content]), [['assistant', 'Rp 1']]);
});

test('empty or missing transcription is ignored', () => {
  const t = createLiveTranscript(() => 'x', () => 1);
  assert.deepEqual(t.apply({}), []);
  assert.deepEqual(t.apply({ outputTranscription: { text: '' } }), []);
});
