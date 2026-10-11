const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const output = esbuild.buildSync({ entryPoints: ['src/lib/liveAudio.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module('live-audio'); mod._compile(output, 'live-audio');
const { pcm16, resampleMono } = mod.exports;
test('resamples stereo 48k to mono 16k and clamps little-endian PCM', () => {
 const a = new Float32Array(1920).fill(1); const b = new Float32Array(1920).fill(-1);
 assert.equal(resampleMono([a, b], 48000).length, 640);
 assert.ok(resampleMono([a, b], 48000).every(x => x === 0));
 assert.deepEqual([...pcm16(new Float32Array([-2, 0, 2]))], [0, 128, 0, 0, 255, 127]);
});
