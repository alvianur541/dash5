const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');

// Offline real-hook test, with deterministic auth switching and deferred fixture reads.
async function harness() {
  let slot = 0;
  const slots = [], effects = [], requests = [], writes = [];
  const stored = new Map();
  let foreground;
  const fixture = {
    load(uid) { return stored.get(uid) ?? []; },
    replace(uid, items) { stored.set(uid, items); writes.push({ uid, ids: items.map(item => item.id) }); },
    foreground(fn) { foreground = fn; return () => { if (foreground === fn) foreground = undefined; }; },
    useRef(v) { const i = slot++; return slots[i] ??= { current: v }; },
    useState(v) { const i = slot++; if (!(i in slots)) slots[i] = v; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useCallback(fn, deps) { const i = slot++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
    useMemo(fn, deps) { const i = slot++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = slot++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    fetch(uid) { return new Promise(resolve => requests.push({ uid, resolve })); },
  };
  const stubs = {
    react: 'export const {useRef,useState,useCallback,useEffect,useMemo}=globalThis.fixture;',
    '../services/supabase': 'export const fetchBookmarksRemote=globalThis.fixture.fetch; export const upsertBookmarkRemote=async()=>true; export const deleteBookmarkRemote=async()=>{};',
    '../services/storage': 'export const loadPocket=globalThis.fixture.load; export const loadPocketTombstones=()=>({}); export const replacePocket=globalThis.fixture.replace; export const markPocketSynced=()=>{}; export const savePocketItem=()=>[]; export const removePocketItem=()=>[]; export const addPocketTombstone=()=>{}; export const clearPocketTombstone=()=>{};',
    '../lib/onForeground': 'export const onForeground=globalThis.fixture.foreground;',
  };
  const result = await build({ entryPoints: [path.join(__dirname, 'usePocket.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, a => a.path in stubs ? { path: a.path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path] }));
  } }] });
  const context = { module: { exports: {} }, fixture, console };
  vm.runInNewContext(result.outputFiles[0].text, context);
  const mounted = { current: true };
  const render = uid => { slot = 0; const hook = context.module.exports.usePocket(uid, mounted); while (effects.length) effects.shift()(); return hook; };
  return { render, requests, stored, writes, sync: () => foreground?.(), mounted };
}

test('old-account bookmark fetch cannot publish into the newly signed-in account', async () => {
  const h = await harness();
  h.render('A');
  h.render('B');
  h.requests[1].resolve([{ message_id: 'B-bookmark', model: 'ZW140', answer: 'B fixture', saved_at: new Date().toISOString() }]);
  await new Promise(r => setImmediate(r));
  h.requests[0].resolve([{ message_id: 'A-private', model: 'ZX200-5G', answer: 'A fixture', saved_at: new Date().toISOString() }]);
  await new Promise(r => setImmediate(r));
  assert.equal(h.render('B').pocket[0].id, 'B-bookmark');
});

test('A→B→A old bookmark response cannot overwrite fresh A UI or persisted state', async () => {
  const h = await harness();
  h.render('A');
  h.render('B');
  h.render('A');
  h.requests[2].resolve([{ message_id: 'A-fresh', model: 'ZW140', answer: 'fresh', saved_at: '2020-01-01' }]);
  await new Promise(r => setImmediate(r));
  h.requests[0].resolve([{ message_id: 'A-old', model: 'ZW140', answer: 'old', saved_at: '2020-01-01' }]);
  await new Promise(r => setImmediate(r));
  assert.equal(h.render('A').pocket[0].id, 'A-fresh');
  assert.equal(h.stored.get('A')[0].id, 'A-fresh');
  assert.equal(h.writes.length, 1);
});

test('overlapping same-account sync keeps newest UI and persisted response', async () => {
  const h = await harness();
  h.render('A');
  const newer = h.sync();
  h.requests[1].resolve([{ message_id: 'A-fresh', model: 'ZW140', answer: 'fresh', saved_at: '2020-01-01' }]);
  await newer;
  h.requests[0].resolve([{ message_id: 'A-old', model: 'ZW140', answer: 'old', saved_at: '2020-01-01' }]);
  await new Promise(r => setImmediate(r));
  assert.equal(h.render('A').pocket[0].id, 'A-fresh');
  assert.equal(h.stored.get('A')[0].id, 'A-fresh');
  assert.equal(h.writes.length, 1);
});

test('logout invalidates pending bookmark reads without persistence or visible details', async () => {
  const h = await harness();
  h.render('A').setPocketView({ id: 'A-private', answer: 'private' });
  h.render(null);
  h.requests[0].resolve([{ message_id: 'A-old', model: 'ZW140', answer: 'old', saved_at: '2020-01-01' }]);
  await new Promise(r => setImmediate(r));
  const hook = h.render(null);
  assert.equal(hook.pocket.length, 0);
  assert.equal(hook.pocketView, null);
  assert.equal(h.writes.length, 0);
});

test('unmounted hook does not persist or publish a pending read', async () => {
  const h = await harness();
  h.render('A');
  h.mounted.current = false;
  h.requests[0].resolve([{ message_id: 'A-old', model: 'ZW140', answer: 'old', saved_at: '2020-01-01' }]);
  await new Promise(r => setImmediate(r));
  assert.equal(h.render('A').pocket.length, 0);
  assert.equal(h.writes.length, 0);
});

test('legitimate current sync loads local bookmarks then merges unsynced saves with remote', async () => {
  const h = await harness();
  h.stored.set('A', [{ id: 'local', model: 'ZW140', answer: 'local', savedAt: 1, synced: false }]);
  h.render('A');
  assert.equal(h.render('A').pocket[0].id, 'local');
  h.requests[0].resolve([{ message_id: 'remote', model: 'ZW140', answer: 'remote', saved_at: '2020-01-01' }]);
  await new Promise(r => setImmediate(r));
  assert.equal(h.render('A').pocket.map(item => item.id).join(','), 'remote,local');
  assert.equal(h.stored.get('A').map(item => item.id).join(','), 'remote,local');
});

test('open bookmark details are cleared on direct account switching', async () => {
  const h = await harness();
  h.render('A').setPocketView({ id: 'A-private', answer: 'private fixture' });
  h.render('B');
  assert.equal(h.render('B').pocketView, null);
});
