const fs = require('fs');
const vm = require('vm');
const http = require('http');
const path = require('path');
const express = require('express');
const { suite } = require('./helpers.cjs');

module.exports = async () => {
  const { t, done } = suite('rich answer HTTP/SSE transport');
  const app = express();
  const config = {
    ALLOWED_MODELS: new Set(['provider-model']), BASE64_RE: /^[A-Za-z0-9+/=\s]+$/,
    HISTORY_MAX_CHARS: 24000, HISTORY_MAX_MSG: 20, IMAGE_MAX_BYTES: 1024,
    IMAGE_MIME_ALLOWED: new Set(['image/png']), REQUEST_DEADLINE_MS: 5000,
    RERANKER: 'google', SUPABASE_ANON_KEY: 'fixture', SUPABASE_URL: 'https://fixture.invalid',
    UPSTREAM_TIMEOUT_MS: 5000, imageMagicMatches: () => true,
  };
  let active;
  const presentation = { version: 1, blocks: [
    { type: 'technical_news', title: 'Fixture bulletin', affectedModels: ['ZX200-5G'], sources: [{ documentId: '10351', title: 'Fixture bulletin', category: 'TECHNICAL NEWS' }] },
    { type: 'markdown', content: 'offline answer' },
  ] };
  const orch = {
    UNIT_MODELS: ['ZX200-5G'], MODEL: 'provider-model', INTENT_MODEL: 'intent-model', FALLBACK_MODELS: [],
    newUsage: () => ({ input: 0, output: 0, calls: 0, thinking: 0, cached: 0 }),
    instrumentDeps: () => {}, stage: async (_name, fn) => fn(), fetchHexParts: async () => [], detectLang: () => 'id',
    runWithDeps: async (deps, fn) => { active = deps; return fn(); },
    generateResponseStream: async (_unit, _name, _history, input, onChunk) => {
      if (input === 'error') throw new Error('fixture failure');
      onChunk('offline answer');
      if (input === 'card' && active.richAnswersEnabled) active.meta.presentation = presentation;
      return 'offline answer';
    },
    generateResponse: async () => 'photo answer',
  };
  const fakeServer = { listen() {}, address: () => ({ port: 0 }) };
  const fakeRequire = name => {
    if (name === 'express') return Object.assign(() => app, express);
    if (name === './dist/orchestrator.cjs') return orch;
    if (name === './server/auth') return { rateLimit: (_q, _s, n) => n(), securityHeaders: () => {}, verifyToken: (req, _res, next) => { req.authToken = 'token'; req.authUser = { id: 'u' }; next(); } };
    if (name === './server/config') return config;
    if (name === './server/observability') return { _stat: { req: {}, err: {} }, catatLive() {}, catatPemakaian() {}, catatStat() {}, registerMetrics() {}, ringkasTanya: x => x };
    if (name === './server/upstream') return { cohereRerank: async () => ({ results: [] }), embedQuery: async () => [], getAccessToken: async () => '', googleRerank: async () => [], vertexFetch: async () => ({ ok: true, json: async () => ({}) }) };
    if (name === './server/transcribe') return () => {};
    if (name === './server/live-voice') return { registerLiveVoice() {}, liveAllowed: () => false };
    if (name === '@supabase/postgrest-js') return { PostgrestClient: class {} };
    if (name === 'node:http') return { createServer: () => fakeServer };
    if (name === 'undici') return { setGlobalDispatcher() {}, Agent: class {} };
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8'), {
    console, process, require: fakeRequire, AbortController, AbortSignal, TextDecoder, setTimeout, clearTimeout,
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const ask = async (body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/ask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' }, body: JSON.stringify({ model: 'ZX200-5G', ...body }),
    });
    return (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  };
  const priorFlag = process.env.RICH_ANSWERS_ENABLED;
  try {
    process.env.RICH_ANSWERS_ENABLED = 'true';
    const events = await ask({ userInput: 'card' });
    t(events.map(e => e.ev).join(',') === 'text,meta,presentation,done', 'enabled regular chat emits meta then presentation then done');

    process.env.RICH_ANSWERS_ENABLED = 'false';
    const disabled = await ask({ userInput: 'card' });
    t(disabled.map(e => e.ev).join(',') === 'text,meta,done', 'disabled flag keeps the legacy SSE sequence');

    process.env.RICH_ANSWERS_ENABLED = 'true';
    const live = await ask({ userInput: 'card', source: 'live' });
    t(live.map(e => e.ev).join(',') === 'text,meta,done', 'Live requests never emit presentation');
    const noCard = await ask({ userInput: 'plain' });
    t(noCard.map(e => e.ev).join(',') === 'text,meta,done', 'answers without a validated card keep the legacy SSE sequence');
    const error = await ask({ userInput: 'error' });
    t(error.map(e => e.ev).join(',') === 'error,done', 'errors never emit meta or presentation');
  } finally {
    if (priorFlag === undefined) delete process.env.RICH_ANSWERS_ENABLED;
    else process.env.RICH_ANSWERS_ENABLED = priorFlag;
    await new Promise(resolve => server.close(resolve));
  }
  return done();
};
