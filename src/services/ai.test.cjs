const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');

async function loadClient(frames, initial = {}, options = {}) {
  const entries = new Map(Object.entries(initial));
  let requests = 0;
  const result = await build({
    entryPoints: [path.join(__dirname, 'ai.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'auth-stub', setup(b) {
      b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'auth', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export async function getAuthToken() { return "account-token"; }' }));
    } }],
  });
  const context = {
    module: { exports: {} }, console, setTimeout, clearTimeout, URLSearchParams, AbortController, DOMException, TextDecoder,
    localStorage: { getItem: k => entries.get(k), setItem: (k, v) => entries.set(k, v), removeItem: k => entries.delete(k) },
    fetch: async (_url, init) => {
      requests++;
      assert.equal(init.headers.Authorization, 'Bearer account-token');
      if (options.idleAfterPartial) {
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"ev":"text","text":"Partial answer"}\n\n'));
          init.signal.addEventListener('abort', () => controller.error(new DOMException('Idle', 'AbortError')));
        } }));
      }
      return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''));
    },
  };
  if (options.idleAfterPartial) context.setTimeout = (fn, ms) => setTimeout(fn, ms === 130000 ? 5 : ms);
  vm.runInNewContext(result.outputFiles[0].text, context);
  return { client: context.module.exports, entries, requests: () => requests };
}

const send = client => client.generateResponseStream('ZX200-5G', 'Technician', [], 'harga starter', () => {});

for (const frames of [
  [{ ev: 'text', text: 'Partial answer' }, { ev: 'error', message: 'Stream terputus' }, { ev: 'done' }],
  [{ ev: 'text', text: 'Partial answer' }],
  [{ ev: 'text', text: 'Partial answer' }, { ev: 'done' }],
]) {
  test(`partial stream rejects without successful completion: ${JSON.stringify(frames)}`, async () => {
    const { client } = await loadClient(frames);
    await assert.rejects(send(client), /Stream terputus/);
  });
}

test('answers always use authenticated server, never legacy shared cache or cacheable price storage', async () => {
  const fresh = 'Fresh authorized price from the server, long enough to qualify for the old answer cache';
  const key = 'dash-ans-g10:ZX200-5G::harga starter';
  const original = JSON.stringify({ text: 'Other account price answer', exp: Date.now() + 60000 });
  const { client, entries, requests } = await loadClient([
    { ev: 'text', text: fresh }, { ev: 'meta', full: fresh, cacheable: true }, { ev: 'done' },
  ], { [key]: original });
  assert.equal(await send(client), fresh);
  assert.equal(await send(client), fresh);
  assert.equal(requests(), 2);
  assert.equal(entries.get(key), original);
});

test('idle timeout rejects even after partial text', async () => {
  const { client } = await loadClient([], {}, { idleAfterPartial: true });
  await assert.rejects(send(client), /SERVER_DIAM/);
});

test('final server text replaces streamed draft only on completed success', async () => {
  const { client } = await loadClient([
    { ev: 'text', text: 'Uncorrected draft' },
    { ev: 'meta', full: 'Corrected answer', cacheable: false }, { ev: 'done' },
  ]);
  assert.equal(await send(client), 'Corrected answer');
});
