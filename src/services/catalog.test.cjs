const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');

async function fixture() {
  let token = 'staff-fixture';
  let calls = 0;
  let resolve;
  let pending = false;
  const client = {
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
    rpc: async () => {
      calls++;
      if (pending) return new Promise(r => { resolve = r; });
      return { data: token === 'staff-fixture' ? [{ model: 'ZX200-5G', kategori: 'PRIVATE-FIXTURE', count: 1 }] : [], error: null };
    },
  };
  const compiled = await build({ entryPoints: [path.join(__dirname, 'supabase.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@supabase/supabase-js'], define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://fixture.test"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"fixture-anon"' } });
  const context = { module: { exports: {} }, console, require: () => ({ createClient: () => client }) };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  return { catalog: context.module.exports.fetchDocumentCatalog, setToken: t => { token = t; }, setPending: () => { pending = true; }, finish: () => resolve({ data: [{ model: 'ZX200-5G', kategori: 'PRIVATE-FIXTURE', count: 1 }], error: null }), calls: () => calls };
}

test('catalog cache cannot disclose a prior account catalog after switching or logout', async () => {
  const f = await fixture();
  assert.equal((await f.catalog()).length, 1);
  f.setToken('restricted-fixture');
  assert.equal((await f.catalog()).length, 0);
  assert.equal(f.calls(), 2);
  f.setToken(null);
  assert.equal((await f.catalog()).length, 0);
  assert.equal(f.calls(), 2);
});

test('catalog response arriving after account switching is discarded', async () => {
  const f = await fixture();
  f.setPending();
  const loading = f.catalog();
  await new Promise(r => setImmediate(r));
  f.setToken('restricted-fixture');
  f.finish();
  assert.equal((await loading).length, 0);
});
