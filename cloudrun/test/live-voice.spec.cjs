const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeSetup, inputFrame } = require('../server/live-voice');
test('voice-only setup fixes model and exposes server tool, not native RAG', () => {
  const s = makeSetup('project-test', 'us-central1', 'ZX200-5G').setup;
  assert.equal(s.model, 'projects/project-test/locations/us-central1/publishers/google/models/gemini-3.8-live');
  assert.deepEqual(s.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(s.tools[0].functionDeclarations[0].name, 'ask_technical');
  assert.ok(s.inputAudioTranscription && s.outputAudioTranscription);
});
test('rejects arbitrary provider frames and oversized or odd PCM', () => {
  for (const m of [{ setup: {} }, { type: 'audio', data: Buffer.alloc(641).toString('base64') }, { type: 'audio', data: Buffer.alloc(3202).toString('base64') }]) assert.throws(() => inputFrame(m));
  assert.equal(inputFrame({ type: 'audio', data: Buffer.alloc(1280).toString('base64') }).realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
});
test('allowlist rejects other accounts before any provider session', async () => {
  const http = require('node:http'); const { once } = require('node:events');
  const { WebSocket } = require('ws'); const { registerLiveVoice, liveAllowed } = require('../server/live-voice');
  assert.equal(liveAllowed('a', new Set(['a'])), true);
  assert.equal(liveAllowed('b', new Set(['a'])), false);
  assert.equal(liveAllowed('b', new Set()), false);
  const server = http.createServer(); let connects = 0;
  const wss = registerLiveVoice(server, { enabled: true, allowed: new Set(['owner']), units: new Set(['ZX200-5G']), origins: ['http://localhost'], verifyToken: (req, _res, next) => { req.authUser = { id: 'other' }; req.authToken = 'x'; next(); }, connect: async () => { connects++; } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/v1/live`, { origin: 'http://localhost' });
  try {
    await once(ws, 'open'); const msg = once(ws, 'message'); ws.send(JSON.stringify({ type: 'auth', token: 'x', unit: 'ZX200-5G' }));
    assert.equal(JSON.parse((await msg)[0]).type, 'error'); assert.equal(connects, 0);
  } finally { ws.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); }
});
test('authenticated relay fixes unit, forwards PCM and tools, cleans concurrency on stop', async () => {
  const http = require('node:http'); const { EventEmitter, once } = require('node:events');
  const { WebSocket } = require('ws'); const { registerLiveVoice } = require('../server/live-voice');
  const server = http.createServer(); const provider = new EventEmitter(); provider.readyState = 1; provider.bufferedAmount = 0;
  const sent = []; provider.send = x => sent.push(JSON.parse(x)); provider.terminate = () => { provider.readyState = 3; };
  let bound; let lookup;
  const wss = registerLiveVoice(server, { enabled: true, allowed: new Set(['user1']), units: new Set(['ZX200-5G']), origins: ['http://localhost'], verifyToken: (req, res, next) => { if (req.headers.authorization !== 'Bearer fixture') return res.status(401).json({}); req.authUser = { id: 'user1' }; req.authToken = 'fixture'; next(); }, connect: async unit => { bound = unit; setTimeout(() => provider.emit('message', Buffer.from('{"setupComplete":{}}')), 5); return provider; }, ask: async (...args) => { lookup = args; return 'Authorized fixture answer with source'; } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/v1/live`, { origin: 'http://localhost' });
  try {
    await once(ws, 'open'); const ready = once(ws, 'message'); ws.send(JSON.stringify({ type: 'auth', token: 'fixture', unit: 'ZX200-5G' }));
    assert.equal(JSON.parse((await ready)[0]).type, 'ready'); assert.equal(bound, 'ZX200-5G');
    ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(1280).toString('base64') }));
    await new Promise(r => setTimeout(r, 10)); assert.equal(sent[0].realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
    provider.emit('message', Buffer.from(JSON.stringify({ toolCall: { functionCalls: [{ id: 'call-1', name: 'ask_technical', args: { question: 'check', unit: 'foreign' } }] } })));
    await new Promise(r => setTimeout(r, 10)); assert.deepEqual(lookup.slice(0, 3), ['fixture', 'ZX200-5G', 'check']); assert.equal(sent[1].toolResponse.functionResponses[0].id, 'call-1');
    const closed = once(ws, 'close'); ws.send('{"type":"stop"}'); await closed; assert.equal(provider.readyState, 3);
  } finally { ws.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); }
});
