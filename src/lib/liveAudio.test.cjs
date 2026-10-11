const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const output = esbuild.buildSync({ entryPoints: ['src/lib/liveAudio.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module('live-audio'); mod._compile(output, 'live-audio');
const { pcm16, resampleMono, createMonoResampler } = mod.exports;
test('streamed callback resampling preserves sample clock and chunk boundaries', () => {
 for (const rate of [44100, 48000]) {
  const input = Float32Array.from({length: 2048 * 100}, (_, i) => Math.sin(i / 37));
  const push = createMonoResampler(rate);
  const chunks = [];
  for (let i = 0; i < input.length; i += 2048) chunks.push(...push([input.subarray(i, i + 2048)]));
  assert.equal(chunks.length, Math.floor(input.length * 16000 / rate));
  assert.deepEqual(new Float32Array(chunks), resampleMono([input], rate));
 }
});
test('direct live socket uses only configured HTTPS backend path without URL credentials', () => {
 assert.equal(mod.exports.liveSocketUrl('https://app.dash5.id/', 'https://backend.run.app'), 'wss://backend.run.app/v1/live');
 assert.equal(mod.exports.liveSocketUrl('http://localhost:3000/'), 'ws://localhost:3000/api/v1/live');
 assert.throws(() => mod.exports.liveSocketUrl('https://app.dash5.id/', 'http://backend.run.app'));
 assert.throws(() => mod.exports.liveSocketUrl('https://app.dash5.id/', 'https://backend.run.app/?token=bad'));
});
test('echo gate blocks mic while AI audio plays and for a short tail after', () => {
  const g = mod.exports.createEchoGate(400);
  assert.equal(g.open(1000), true);
  g.speakingUntil(2000);
  assert.equal(g.open(1500), false);
  assert.equal(g.open(2300), false);
  assert.equal(g.open(2401), true);
  g.speakingUntil(5000); g.cut(3000);
  assert.equal(g.open(3401), true);
});
test('resamples stereo 48k to mono 16k and clamps little-endian PCM', () => {
 const a = new Float32Array(1920).fill(1); const b = new Float32Array(1920).fill(-1);
 assert.equal(resampleMono([a, b], 48000).length, 640);
 assert.ok(resampleMono([a, b], 48000).every(x => x === 0));
 assert.deepEqual([...pcm16(new Float32Array([-2, 0, 2]))], [0, 128, 0, 0, 255, 127]);
});
