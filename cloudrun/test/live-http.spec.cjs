const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHmac } = require('node:crypto');
const { EventEmitter, once } = require('node:events');
const { WebSocket } = require('ws');

test('offline signed JWT relay exercises actual HTTP technical bridge and caller-scoped dependencies', async () => {
 const real = createRequire(path.resolve(__dirname, '../server.js'));
 const config = { ...real('./server/config'), SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon' };
 const payload = Buffer.from(JSON.stringify({ sub: 'fixture-user', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
 const body = `eyJhbGciOiJIUzI1NiJ9.${payload}`;
 const sign = x => createHmac('sha256', 'offline-only-fixture-secret').update(x).digest('base64url');
 const token = `${body}.${sign(body)}`;
 const auth = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/auth.js'), 'utf8'), {
  module: auth, require: () => config, console, process, AbortSignal, Buffer,
  fetch: async (_url, options) => {
   const t = options.headers.Authorization.slice(7), [h, p, s] = t.split('.');
   const valid = s === sign(`${h}.${p}`) && JSON.parse(Buffer.from(p, 'base64url')).exp > Date.now() / 1000;
   return { ok: valid, json: async () => ({ id: 'fixture-user' }) };
  },
 });
 const provider = new EventEmitter(); provider.readyState = 1; provider.bufferedAmount = 0;
 const sent = []; provider.send = x => sent.push(JSON.parse(x)); provider.terminate = () => { provider.readyState = 3; };
 let server, wss, headers, selected, question;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8'), {
  console, process, fetch, AbortController, AbortSignal, TextDecoder, setTimeout, clearTimeout,
  require: name => {
   if (name === './server/auth') return auth.exports;
   if (name === './server/config') return config;
   if (name === 'node:http') return { createServer: app => {
    server = http.createServer(app); const listen = server.listen.bind(server);
    server.listen = (_port, cb) => listen(0, '127.0.0.1', cb); return server;
   } };
   if (name === './server/live-voice') return { registerLiveVoice: (s, deps) => {
    wss = real(name).registerLiveVoice(s, { ...deps, enabled: true, allowed: new Set(['fixture-user']), origins: ['http://fixture.local'], connect: async () => {
     setTimeout(() => provider.emit('message', Buffer.from('{"setupComplete":{}}')), 5); return provider;
    } });
   } };
   if (name === './dist/orchestrator.cjs') return { ...real(name), runWithDeps: (_deps, fn) => fn(), generateResponseStream: async (unit, _n, _h, q, emit) => {
    selected = unit; question = q; emit('Offline grounded answer (Fixture Manual — Test).'); return 'Offline grounded answer (Fixture Manual — Test).';
   } };
   if (name === '@supabase/postgrest-js') return { PostgrestClient: class { constructor(_url, opts) { headers = opts.headers; } } };
   if (name === './server/upstream') return { ...real(name), getAccessToken: async () => 'offline' };
   if (name === './server/observability') return { ...real(name), catatPemakaian() {} };
   return real(name);
  },
 });
 await once(server, 'listening');
 const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/v1/live`, { origin: 'http://fixture.local' });
 try {
  await once(ws, 'open'); const ready = once(ws, 'message'); ws.send(JSON.stringify({ type: 'auth', token, unit: 'ZX200-5G' }));
  assert.equal(JSON.parse((await ready)[0]).type, 'ready');
  ws.send(JSON.stringify({ type: 'audio', data: fs.readFileSync(path.resolve(__dirname, 'live-evidence/response.pcm')).subarray(0, 1280).toString('base64') }));
  provider.emit('message', Buffer.from(JSON.stringify({ toolCall: { functionCalls: [{ id: 'technical-1', name: 'ask_technical', args: { question: 'offline technical question', unit: 'foreign' } }] } })));
  for (let n = 0; n < 100 && !sent.some(x => x.toolResponse); n++) await new Promise(r => setTimeout(r, 10));
  assert.equal(headers.Authorization, `Bearer ${token}`); assert.equal(selected, 'ZX200-5G'); assert.equal(question, 'offline technical question');
  const result = sent.find(x => x.toolResponse).toolResponse.functionResponses[0];
  assert.equal(result.id, 'technical-1'); assert.equal(result.response.status, 'ok'); assert.match(result.response.message, /Fixture Manual/);
  assert.ok(sent.some(x => x.realtimeInput?.audio?.mimeType === 'audio/pcm;rate=16000'));
  const interrupted = once(ws, 'message'); provider.emit('message', Buffer.from('{"serverContent":{"interrupted":true}}'));
  assert.equal(JSON.parse((await interrupted)[0]).content.interrupted, true);
  const closed = once(ws, 'close'); ws.send('{"type":"stop"}'); await closed; assert.equal(provider.readyState, 3);
 } finally { ws.terminate(); await new Promise(r => wss.close(r)); await new Promise(r => server.close(r)); }
});
