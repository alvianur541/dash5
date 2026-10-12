const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://fixture.supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'fixture-anon';
const { catatLive, catatPemakaian } = require('../server/observability');

const req = { authToken: 'caller-jwt', authUser: { id: 'u1', email: 'h123@dash5.internal' } };
const usage = { session_id: '11111111-2222-4333-8444-555555555555', user_prefix: 'u1', model: 'gemini-3.8-live', unit: 'ZW140', duration_ms: 22878, ready: true, tools: 1, reason: 'user-stop', billed_turns: 2,
  prompt_tokens: 2812, response_tokens: 206, thoughts_tokens: 210, input_tokens: { TEXT: 2674, AUDIO: 138, VIDEO: 0, IMAGE: 0 }, output_tokens: { TEXT: 30, AUDIO: 176, VIDEO: 0, IMAGE: 0 }, cost_usd: 0.0061, cost_idr: 109.66, cost_complete: true, pricing: { fx_idr: 17977 } };

function capture() {
  const calls = [];
  global.fetch = async (url, opt) => { calls.push({ url, opt, body: JSON.parse(opt.body) }); return { ok: true, status: 201, text: async () => '' }; };
  return calls;
}

test('closed Live session is stored in Supabase live_sessions with the caller JWT and token breakdown', async () => {
  const calls = capture();
  await catatLive(req, usage);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fixture.supabase.invalid/rest/v1/live_sessions');
  assert.equal(calls[0].opt.headers.Authorization, 'Bearer caller-jwt');
  assert.deepEqual(calls[0].body, { session_id: usage.session_id, user_nik: 'h123', model: 'gemini-3.8-live', unit: 'ZW140', duration_ms: 22878, ready: true, tools: 1, reason: 'user-stop', billed_turns: 2,
    prompt_tokens: 2812, response_tokens: 206, thoughts_tokens: 210, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_idr: 109.66, cost_complete: true });
});

test('Live store skips sessions without a verified caller and never throws on network failure', async () => {
  const calls = capture();
  await catatLive({}, usage);
  assert.equal(calls.length, 0);
  global.fetch = async () => { throw new Error('offline'); };
  await catatLive(req, usage);
});

test('technical lookups from Live are tagged live_tool in usage_logs', async () => {
  const calls = capture();
  await catatPemakaian(req, { requestId: 'r', userName: 'T', unit: 'ZW140', usage: { input: 1, output: 1, calls: 1 }, meta: { route: 'rag_found', confidence: 'high', modelUsed: 'gemini-3.8-flash' }, biaya: 0, source: 'live' });
  assert.deepEqual(calls[0].body.tools_used, ['rag_found', 'high', 'gemini-3.8-flash', 'live_tool']);
  const plain = capture();
  await catatPemakaian(req, { requestId: 'r', userName: 'T', unit: 'ZW140', usage: { input: 1, output: 1, calls: 1 }, meta: { route: 'rag_found' }, biaya: 0 });
  assert.deepEqual(plain[0].body.tools_used, ['rag_found']);
});
