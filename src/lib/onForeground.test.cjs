const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

// Desktop tabs stay 'visible' while another window is focused, so visibilitychange alone never re-syncs.
function load() {
  const ls = { doc: {}, win: {} }, timers = [];
  let now = 1_000_000;
  const target = k => ({ addEventListener(e, f) { ls[k][e] = f; }, removeEventListener(e, f) { if (ls[k][e] === f) delete ls[k][e]; } });
  const document = { visibilityState: 'visible', ...target('doc') };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(readFileSync(path.join(__dirname, 'onForeground.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, document, window: target('win'), Date: { now: () => now },
    setInterval: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearInterval: id => { timers[id - 1].cleared = true; },
  });
  return { on: module.exports.onForeground, ls, timers, document, tick: ms => { now += ms; } };
}

test('focus, online and visible polling all re-sync, rate limited', () => {
  const h = load();
  let n = 0;
  const off = h.on(() => n++);
  h.ls.win.focus(); assert.equal(n, 0, 'no burst right after mount');
  h.tick(16_000); h.ls.win.focus(); assert.equal(n, 1, 'window focus re-syncs');
  h.ls.win.online(); assert.equal(n, 1, 'gap respected');
  h.tick(60_000); h.timers[0].f(); assert.equal(n, 2, 'poll while visible re-syncs');
  h.document.visibilityState = 'hidden'; h.tick(60_000); h.timers[0].f(); assert.equal(n, 2, 'hidden tab does not poll');
  h.document.visibilityState = 'visible'; h.ls.doc.visibilitychange(); assert.equal(n, 3, 'returning tab/PWA re-syncs');
  off();
  assert.ok(h.timers[0].cleared && !h.ls.win.focus && !h.ls.doc.visibilitychange, 'cleanup removes listeners and timer');
});
