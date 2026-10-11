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

test('spoken numbers and unit names in transcripts become digits like the text chat', () => {
  const { tidyTranscript } = mod.exports;
  const cases = [
    ['Siap, kita bahas data untuk unit ZXdua ratus dash lima G saat servis dua ribu jam ya.', 'Siap, kita bahas data untuk unit ZX200-5G saat servis 2.000 jam ya.'],
    ['Bisa cek spesifikasi untuk unit ZX dua ratus dash lima G.', 'Bisa cek spesifikasi untuk unit ZX200-5G.'],
    ['part number sembilan dua empat delapan tujuh nol enam H-P-B harganya dua puluh dua juta empat ratus empat puluh tujuh ribu delapan ratus rupiah.', 'part number 9248706HPB harganya 22.447.800 rupiah.'],
    ['Tekanannya tiga koma sembilan MPa.', 'Tekanannya 3,9 MPa.'],
    ['Unit ZW seratus empat puluh dan ZX empat puluh delapan U dash lima A.', 'Unit ZW140 dan ZX48U-5A.'],
    ['ZX seratus tiga puluh delapan MF dash lima G, ZX enam puluh lima USB dash lima A.', 'ZX138MF-5G, ZX65USB-5A.'],
    ['Panjang totalnya sembilan ribu enam ratus enam puluh milimeter, sebelas liter, dua belas baut.', 'Panjang totalnya 9.660 milimeter, 11 liter, 12 baut.'],
    ['Satu kalimat saja, dua langkah.', 'Satu kalimat saja, dua langkah.'],
    ['Unit Zaxis dua ratus dash lima G siap.', 'Unit ZX200-5G siap.'],
    ['Zaxis 200-5G dan zaxis seratus tiga puluh delapan MF dash lima G.', 'ZX200-5G dan ZX138MF-5G.'],
    ['Seri Zaxis memang bandel.', 'Seri ZX memang bandel.'],
  ];
  for (const [input, want] of cases) assert.equal(tidyTranscript(input), want);
});

test('assistant bubble shows tidied numbers while streaming', () => {
  const t = createLiveTranscript(() => 'a', () => 1);
  t.apply({ outputTranscription: { text: 'Unit ZX dua ratus dash ' } });
  assert.equal(t.apply({ outputTranscription: { text: 'lima G siap.' } })[0].content, 'Unit ZX200-5G siap.');
});

test('empty or missing transcription is ignored', () => {
  const t = createLiveTranscript(() => 'x', () => 1);
  assert.deepEqual(t.apply({}), []);
  assert.deepEqual(t.apply({ outputTranscription: { text: '' } }), []);
});
