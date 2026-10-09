const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');

test('quota recovery evicts successive session bodies, not the same missing body', async () => {
  const values = new Map([
    ['dash-session-list-owner', JSON.stringify([{ id: 'newer' }, { id: 'oldest' }])],
    ['dash-session-owner-newer', 'x'.repeat(100)],
    ['dash-session-owner-oldest', 'x'.repeat(100)],
  ]);
  const storage = {};
  for (const key of values.keys()) Object.defineProperty(storage, key, { enumerable: true, configurable: true });
  Object.assign(storage, {
    getItem: key => values.get(key) ?? null,
    removeItem: key => { values.delete(key); delete storage[key]; },
    setItem: (key, value) => {
      if ([...values.keys()].some(k => /^dash-session-owner-/.test(k))) throw new DOMException('full', 'QuotaExceededError');
      values.set(key, value);
    },
  });
  const compiled = await build({ entryPoints: [path.join(__dirname, 'storage.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' });
  const context = { module: { exports: {} }, console, localStorage: storage, DOMException };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  context.module.exports.replacePocket('owner', [{ id: 'saved', answer: 'fixture' }]);
  assert.equal(values.has('dash-pocket-owner'), true, 'new bookmark survives quota recovery');
  assert.equal(JSON.parse(values.get('dash-pocket-owner'))[0].id, 'saved');
  assert.equal(values.has('dash-session-owner-oldest'), false);
  assert.equal(values.has('dash-session-owner-newer'), false);
});
