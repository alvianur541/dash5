const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const vm = require('node:vm');

function workbox() {
  let options;
  const context = { module: { exports: {} }, __dirname: path.resolve(__dirname, '..'), require(name) {
    if (name === 'path') return path;
    if (name === 'vite') return { defineConfig: fn => fn(), loadEnv: () => ({}) };
    if (name === 'vite-plugin-pwa') return { VitePWA: value => { options = value; } };
    return () => ({});
  } };
  vm.runInNewContext(transformSync(readFileSync(path.resolve(__dirname, '../vite.config.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, context);
  return options.workbox;
}

test('activation removes the legacy broad runtime cache without deleting precache', async () => {
  assert.ok(workbox().importScripts?.includes('/sw-cache-cleanup-v1.js'));
  let activate, pending;
  const deleted = [];
  vm.runInNewContext(readFileSync(path.resolve(__dirname, '../public/sw-cache-cleanup-v1.js'), 'utf8'), {
    self: { addEventListener: (_event, fn) => { activate = fn; } },
    caches: { delete: async name => { deleted.push(name); return true; } },
  });
  activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['app-shell']);
});

test('protected API and Supabase proxy reads are network-only on both app domains', () => {
  const config = workbox();
  for (const host of ['dash5.my.id', 'app.dash5.id']) {
    for (const route of ['/supabase/rest/v1/chat_sessions', '/supabase/auth/v1/user', '/api/metrics', '/v1/ask']) {
      const url = new URL(`https://${host}${route}`);
      const matching = config.runtimeCaching.find(rule => typeof rule.urlPattern === 'function' ? rule.urlPattern({ url }) : rule.urlPattern.test(url.href));
      assert.equal(matching?.handler, 'NetworkOnly', `${host}${route}`);
      assert.ok(config.navigateFallbackDenylist.some(rule => rule.test(route)), route);
    }
  }
});
