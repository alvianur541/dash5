const fs = require('fs');
const vm = require('vm');
const http = require('http');
const { createRequire } = require('module');
const path = require('path');
const express = require('express');
const { suite } = require('./helpers.cjs');

module.exports = async () => {
  const { t, done } = suite('demo HTTP gates and validation ordering');
  const app = express();
  app.listen = () => {};
  const realRequire = createRequire(path.resolve(__dirname, '../server.js'));
  let gateCalls = 0;
  const auth = realRequire('./server/auth');
  const fakeRequire = name => {
    if (name === 'express') return Object.assign(() => app, express);
    if (name === './server/auth') return { ...auth,
      verifyToken(req, _res, next) { req.authUser = { email: 'h000@dash5.internal' }; next(); },
      demoLimit(...args) { gateCalls++; return auth.demoLimit(...args); },
    };
    if (name === './server/config') return { ...realRequire(name), SUPABASE_URL: 'https://unused.test', SUPABASE_ANON_KEY: 'test' };
    return realRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8'), {
    require: fakeRequire, console, process, AbortController, AbortSignal, setTimeout, clearTimeout,
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const post = (route, body) => fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    let r = await post('/v1/ask', { model: 'invalid', userInput: 'hello' });
    t(r.status === 400 && gateCalls === 0, 'invalid unit rejected before demo/quota gate');
    r = await post('/v1/ask', { model: 'ZX200-5G', userInput: '' });
    t(r.status === 400 && gateCalls === 0, 'empty input rejected before demo/quota gate');
    r = await post('/v1/ask', { model: 'ZX200-5G', userInput: 'hello' });
    t(r.status === 503 && /DEMO_UNAVAILABLE/.test(await r.text()), 'valid demo ask denied before SSE or retrieval');
    r = await post('/v1/transcribe', { audio: 'AAAA', mimeType: 'audio/webm' });
    t(r.status === 503 && /DEMO_UNAVAILABLE/.test(await r.text()), 'demo transcription denied before upstream');
  } finally { await new Promise(resolve => server.close(resolve)); }
  return done();
};
