const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');

// Offline hook harness: real useChat, fixture React scheduler and network promises.
async function harness() {
  let slot = 0;
  const slots = [], effects = [], requests = [];
  const fixture = {
    useRef(value) { const i = slot++; return slots[i] ??= { current: value }; },
    useState(value) { const i = slot++; if (!(i in slots)) slots[i] = value; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useCallback(fn, deps) { const i = slot++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = slot++; if (!slots[i] || deps.some((d, n) => d !== slots[i][n])) { slots[i] = deps; effects.push(fn); } },
    fetchSessionData(id) { return new Promise(resolve => requests.push({ id, resolve })); },
  };
  const stubs = {
    react: 'export const {useRef,useState,useCallback,useEffect}=globalThis.fixture;',
    '../services/supabase': 'export const fetchSessionData=globalThis.fixture.fetchSessionData; export const fetchUserSessionList=async()=>null; export const saveOrUpdateChatSession=()=>{}; export const deleteChatSession=()=>{}; export const deleteAllChatSessions=async()=>true;',
    '../services/ai': 'export const warmupProxy=()=>{}; export const generateResponse=async()=>"fixture"; export const generateResponseStream=async()=>"fixture";',
    '../services/storage': 'export const loadSessionData=()=>null; export const loadSessionList=()=>[]; export const loadSessionTombstones=()=>({}); export const pendingClearAt=()=>0; export const saveSession=()=>[]; export const deleteSessionData=()=>{}; export const deleteAllSessionData=()=>{}; export const listKey=()=>"fixture"; export const addSessionTombstones=()=>{}; export const setPendingClear=()=>{}; export const clearPendingClear=()=>{};',
    '../lib/onForeground': 'export const onForeground=()=>()=>{};',
  };
  const compiled = await build({ entryPoints: [path.join(__dirname, 'useChat.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }));
  } }] });
  const ctx = { module: { exports: {} }, fixture, console, AbortController, setTimeout, clearTimeout, navigator: { onLine: true }, localStorage: { setItem() {} } };
  vm.runInNewContext(compiled.outputFiles[0].text, ctx);
  const user = { uid: 'fixture-user' };
  const render = () => { slot = 0; const hook = ctx.module.exports.useChat(user, true); while (effects.length) effects.shift()(); return hook; };
  render();
  return { render, requests };
}

test('A to B to A navigation rejects the first stale A response', async () => {
  const h = await harness();
  const oldA = h.render().handleSelectSession('A');
  h.render();
  const b = h.render().handleSelectSession('B');
  h.render();
  const newA = h.render().handleSelectSession('A');
  h.render();
  h.requests[2].resolve({ model: 'ZX200-5G', messages: [{ id: 'fresh', content: 'fresh fixture' }] });
  await newA;
  h.render();
  h.requests[0].resolve({ model: 'ZW140', messages: [{ id: 'stale', content: 'stale fixture' }] });
  await oldA;
  assert.equal(h.render().messages[0].id, 'fresh');
  assert.equal(h.render().selectedModel, 'ZX200-5G');
  h.requests[1].resolve(null);
  await b;
});
