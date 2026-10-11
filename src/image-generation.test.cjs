const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

async function load(file, fetchImpl) {
  const result = await build({ entryPoints: [path.join(__dirname, file)], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], define: { 'import.meta.env': '{}' }, plugins: [{ name: 'auth', setup(b) {
    b.onResolve({ filter: /services\/ai$|\.\/ai$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const PROXY_URL="/api"; export async function authHeaders(){return {Authorization:"Bearer account-token","Content-Type":"application/json"};}' }));
  } }] });
  const context = { module: { exports: {} }, require, console, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, Uint8Array, Blob, atob };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports;
}

test('explicit illustration call sends only owned message identifiers with auth; safe image becomes blob', async () => {
  let calls = 0;
  const client = await load('services/imageGeneration.ts', async (url, init) => {
    calls++;
    assert.equal(url, '/api/v1/images');
    assert.equal(init.headers.Authorization, 'Bearer account-token');
    assert.deepEqual(JSON.parse(init.body), { sessionId: 'session', messageId: 'answer' });
    return Response.json({ mimeType: 'image/png', data: 'iVBORw0KGgo=', disclaimer: 'server disclaimer' });
  });
  assert.equal(calls, 0);
  const blob = await client.generateImage('session', 'answer');
  assert.equal(blob.type, 'image/png'); assert.equal(calls, 1);
});

test('illustration errors surface without retrying billable requests; SVG is rejected', async () => {
  const client = await load('services/imageGeneration.ts', async () => Response.json({ error: 'Kuota ilustrasi sedang penuh' }, { status: 429 }));
  await assert.rejects(client.generateImage('session', 'answer'), /Kuota ilustrasi/);
  const unsafe = await load('services/imageGeneration.ts', async () => Response.json({ mimeType: 'image/svg+xml', data: 'eA==' }));
  await assert.rejects(unsafe.generateImage('session', 'answer'), /Format ilustrasi/);
});

test('actual illustration output renders disclaimer, download action, loading and recoverable error', async () => {
  const { IllustrationView } = await load('components/ImageIllustration.tsx');
  const render = props => renderToStaticMarkup(React.createElement(IllustrationView, { onGenerate() {}, onSave() {}, ...props }));
  const ready = render({ url: 'blob:fixture' });
  assert.match(ready, /Ilustrasi konseptual/); assert.match(ready, /bukan wiring diagram resmi/);
  assert.match(ready, /Simpan \/ kirim ilustrasi/); assert.match(ready, /blob:fixture/);
  assert.match(render({ busy: true }), /Membuat ilustrasi/);
  assert.match(render({ error: 'Kuota penuh' }), /role="alert"/);
  assert.match(render({}), /Buat ilustrasi/);
});
