const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { suite } = require('./helpers.cjs');

module.exports = async () => {
  const { t, done } = suite('transcription cancellation and deadline (offline fixtures)');
  for (const mode of ['disconnect', 'deadline']) {
    let handler, signal;
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/transcribe.js'), 'utf8'), {
      module: mod, console, AbortController, AbortSignal, clearTimeout,
      setTimeout: (fn) => setTimeout(fn, 20),
      require: n => n === './config' ? { ...require('../server/config'), PROJECT_ID: 'fixture' } : { resolveUpstream: async () => ({ url: 'https://fixture.test', headers: {} }) },
      fetch: async (_url, options) => {
        signal = options.signal;
        if (!signal) return { ok: true, json: async () => ({}) };
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      },
    });
    mod.exports({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, {});
    const res = new EventEmitter();
    res.status = () => res;
    let writes = 0;
    res.json = () => { writes++; res.writableFinished = true; };
    const pending = handler({ body: { audio: 'AAAA', mimeType: 'audio/webm' } }, res);
    await new Promise(r => setTimeout(r, 1));
    if (mode === 'disconnect') res.emit('close');
    await pending;
    t(signal?.aborted === true, `${mode} cancels the real upstream signal`);
    t(res.listenerCount('close') === 0, `${mode} removes disconnect listener`);
    t(writes === (mode === 'disconnect' ? 0 : 1), `${mode} writes only to a connected response`);
  }
  for (const mode of ['deadline', 'disconnect', 'late-rejection']) {
    let handler, deadline, settle, rejectCredentials, fetches = 0, writes = 0, status, cleared = 0, timeoutMs;
    const credentials = new Promise((resolve, reject) => { settle = resolve; rejectCredentials = reject; });
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/transcribe.js'), 'utf8'), {
      module: mod, console, AbortController,
      setTimeout: (fn, ms) => { deadline = fn; timeoutMs = ms; return 42; },
      clearTimeout: id => { if (id === 42) cleared++; },
      require: n => n === './config' ? { ...require('../server/config'), PROJECT_ID: 'fixture' } : { resolveUpstream: () => credentials },
      fetch: async () => { fetches++; return { ok: true, json: async () => ({}) }; },
    });
    mod.exports({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, {});
    const res = new EventEmitter();
    res.status = code => { status = code; return res; };
    res.json = () => { writes++; res.writableFinished = true; };
    const pending = handler({ body: { audio: 'AAAA', mimeType: 'audio/webm' } }, res);
    await new Promise(r => setImmediate(r));
    if (mode === 'disconnect') res.emit('close'); else deadline();
    const finished = await Promise.race([pending.then(() => true), new Promise(r => setImmediate(() => r(false)))]);
    t(finished, `${mode} settles handler while credentials remain pending`);
    t(writes === (mode === 'disconnect' ? 0 : 1) && (mode === 'disconnect' || status === 504), `${mode} returns 504 only while connected`);
    t(timeoutMs === 35_000, `${mode} preserves production 35-second deadline`);
    t(cleared === 1 && res.listenerCount('close') === 0, `${mode} cleans timer and close listener before credentials settle`);
    if (mode === 'late-rejection') rejectCredentials(new Error('late credential fixture')); else settle({ url: 'https://fixture.test', headers: {} });
    await pending;
    await new Promise(r => setImmediate(r));
    t(fetches === 0, `${mode} never fetches after late credential settlement`);
    t(writes === (mode === 'disconnect' ? 0 : 1), `${mode} has no late response writes`);
  }
  for (const mode of ['success', 'credential-error', 'upstream-error', 'body-deadline', 'fetch-late']) {
    let handler, deadline, cleared = 0, status = 200, writes = 0, payload, ctrl, resolveLate;
    const late = new Promise(resolve => { resolveLate = resolve; });
    const response = { ok: mode !== 'upstream-error', json: () => mode === 'body-deadline' ? late : Promise.resolve({ candidates: [{ content: { parts: [{ text: ' fixture text ' }] } }] }) };
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/transcribe.js'), 'utf8'), {
      module: mod, console,
      AbortController: class extends AbortController { constructor() { super(); ctrl = this; } },
      setTimeout: fn => { deadline = fn; return 42; }, clearTimeout: () => { cleared++; },
      require: n => n === './config' ? { ...require('../server/config'), PROJECT_ID: 'fixture' } : { resolveUpstream: async () => {
        if (mode === 'credential-error') throw new Error('credential fixture failure');
        return { url: 'https://fixture.test', headers: {} };
      } },
      fetch: async () => mode === 'fetch-late' ? late : response,
    });
    mod.exports({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, {});
    const res = new EventEmitter();
    res.status = code => { status = code; return res; };
    res.json = value => { payload = value; writes++; res.writableFinished = true; };
    const pending = handler({ body: { audio: 'AAAA', mimeType: 'audio/webm' } }, res);
    await new Promise(r => setImmediate(r));
    if (mode === 'body-deadline' || mode === 'fetch-late') deadline();
    await pending;
    t(status === ({ success: 200, 'credential-error': 500, 'upstream-error': 502, 'body-deadline': 504, 'fetch-late': 504 })[mode] && writes === 1, `${mode} preserves appropriate response status`);
    t(mode !== 'success' || payload.text === 'fixture text', `${mode} retains successful transcription output`);
    t(cleared === 1 && res.listenerCount('close') === 0 && require('events').getEventListeners(ctrl.signal, 'abort').length === 0, `${mode} cleans timer and all request cancellation listeners`);
    resolveLate(mode === 'fetch-late' ? response : {});
    await new Promise(r => setImmediate(r));
    t(writes === 1, `${mode} cannot write a late response`);
  }
  return done();
};
