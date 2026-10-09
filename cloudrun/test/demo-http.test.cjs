const fs = require('fs');
const vm = require('vm');
const http = require('http');
const { createRequire } = require('module');
const path = require('path');
const express = require('express');
const { suite } = require('./helpers.cjs');

module.exports = async () => {
  const { t, done } = suite('demo normal authenticated HTTP pipeline');
  const app = express();
  app.listen = () => {};
  const realRequire = createRequire(path.resolve(__dirname, '../server.js'));
  const config = { ...realRequire('./server/config'), SUPABASE_URL: 'https://unused.test', SUPABASE_ANON_KEY: 'test', PROJECT_ID: 'test' };
  let pipelineCalls = 0, upstreamCalls = 0, dbHeaders;
  const users = [
    { id: 'd2425fad-c49f-42dd-9249-9ad2738b7e0b', email: 'renamed@example.test' },
    { id: 'demo-email', email: 'h000@dash5.internal' },
    { id: 'demo-metadata', email: 'other@example.test', app_metadata: { demo: true } },
    { id: 'staff', email: 'staff@example.test' },
  ];
  const authModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/auth.js'), 'utf8'), {
    module: authModule, require: () => config, console, process, AbortSignal,
    fetch: async (_url, options) => {
      const token = options.headers.Authorization.slice(7);
      const user = users[Number(token)];
      return { ok: !!user, json: async () => user };
    },
  });
  const context = { console, process, AbortController, AbortSignal, setTimeout, clearTimeout };
  const fakeRequire = name => {
    if (name === 'express') return Object.assign(() => app, express);
    if (name === './server/auth') return authModule.exports;
    if (name === './server/config' || name === './config') return config;
    if (name === './dist/orchestrator.cjs') return {
      ...realRequire(name),
      runWithDeps: (_deps, fn) => fn(),
      generateResponseStream: async (_unit, _name, _history, _input, onChunk) => {
        pipelineCalls++; onChunk('offline answer'); return 'offline answer';
      },
    };
    if (name === '@supabase/postgrest-js') return { PostgrestClient: class {
      constructor(_url, options) { dbHeaders = options.headers; }
    } };
    if (name === './server/observability') return { ...realRequire(name), catatPemakaian() {} };
    if (name === './server/upstream') return { ...realRequire(name), getAccessToken: async () => 'offline' };
    if (name === './server/transcribe') {
      const module = { exports: {} };
      vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/transcribe.js'), 'utf8'), {
        ...context, module, require: n => n === './config' ? config : { resolveUpstream: async () => ({ url: 'https://offline.test', headers: {} }) },
        fetch: async () => { upstreamCalls++; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'offline transcript' }] } }] }) }; },
      });
      return module.exports;
    }
    return realRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8'), { ...context, require: fakeRequire });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const post = (route, body, token = '0') => fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body),
    });
    const valid = { model: 'ZX200-5G', userInput: 'hello' };
    for (const token of [null, 'invalid']) {
      for (const route of ['/v1/ask', '/v1/transcribe']) {
        const r = await post(route, valid, token);
        t(r.status === 401, `${route} rejects missing/invalid authentication (${token})`);
      }
    }
    t(pipelineCalls === 0 && upstreamCalls === 0, 'unauthorized requests never call AI');
    for (let i = 0; i < users.length; i++) {
      const r = await post('/v1/ask', valid, String(i));
      const body = await r.text();
      t(r.status === 200 && body.includes('offline answer') && body.includes('"ev":"done"'), `authenticated identity ${i} reaches normal SSE pipeline`);
      t(dbHeaders?.Authorization === `Bearer ${i}`, 'retrieval uses caller token, not admin credentials');
      const transcript = await post('/v1/transcribe', { audio: 'AAAA', mimeType: 'audio/webm' }, String(i));
      t(transcript.status === 200 && (await transcript.json()).text === 'offline transcript', `authenticated identity ${i} reaches transcription`);
    }
    for (const [body, status] of [
      [{ ...valid, model: 'invalid' }, 400],
      [{ ...valid, userInput: '' }, 400],
      [{ ...valid, userInput: 'x'.repeat(config.HISTORY_MAX_CHARS + 1) }, 413],
      [{ ...valid, attachments: [{ mimeType: 'image/webp', data: Buffer.from('RIFFxxxxWAVE').toString('base64') }] }, 415],
      [{ ...valid, attachments: [{ mimeType: 'image/heic', data: 'AAAA' }] }, 415],
      [{ ...valid, attachments: [{ mimeType: 'text/plain', data: 'AAAA' }] }, 415],
      [{ ...valid, attachments: [{ mimeType: 'image/png', data: 'not-base64!' }] }, 400],
      [{ ...valid, attachments: [{ mimeType: 'image/png', data: 'AAAA' }] }, 415],
      [{ ...valid, attachments: [{ mimeType: 'image/png', data: 'A'.repeat(12 * 1024 * 1024) }] }, 413],
    ]) {
      const r = await post('/v1/ask', body); t(r.status === status, `demo ask retains validation ${status}`);
    }
    for (const [body, status] of [
      [{}, 400], [{ audio: 'AAAA', mimeType: 'text/plain' }, 415],
      [{ audio: 'bad!', mimeType: 'audio/webm' }, 400],
      [{ audio: 'A'.repeat(9 * 1024 * 1024), mimeType: 'audio/webm' }, 413],
    ]) {
      const r = await post('/v1/transcribe', body); t(r.status === status, `demo transcription retains validation ${status}`);
    }
    t(pipelineCalls === users.length && upstreamCalls === users.length, 'invalid payloads never enter AI pipeline');
    const tooBig = await post('/v1/ask', { ...valid, userInput: 'x'.repeat(21 * 1024 * 1024) });
    t(tooBig.status === 413, 'ordinary JSON body limit retained');
    let limited;
    for (let i = 0; i < config.RATE_LIMIT_PER_MIN; i++) {
      limited = await post('/v1/ask', { ...valid, model: 'invalid' });
      if (limited.status === 429) break;
    }
    t(limited.status === 429, 'demo retains ordinary per-user rate limit');
  } finally { await new Promise(resolve => server.close(resolve)); }
  return done();
};
