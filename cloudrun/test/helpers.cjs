const path = require('path');
const bundle = require(path.join(__dirname, '.build', 'entry.cjs'));

const USAGE = { promptTokenCount: 10, candidatesTokenCount: 5 };

// Fake deps: `script[i]` = chunks emitted on the i-th stream call (last one repeats).
function mockDeps(script, extra = {}) {
  let n = 0;
  const d = {
    supabase: null,
    embed: async () => [],
    rerank: async () => ({ results: [] }),
    generate: async () => ({}),
    stream: async (_body, _model, onChunk) => {
      const s = script[Math.min(n, script.length - 1)];
      n++;
      for (const c of s) onChunk(c);
    },
    usage: { input: 0, output: 0, calls: 0, thinking: 0, cached: 0 },
    meta: {},
    thinkOverride: null,
    ...extra,
  };
  return { d, calls: () => n };
}

function suite(name) {
  let ok = 0, tot = 0;
  const t = (pass, label) => { tot++; if (pass) ok++; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`); };
  const done = () => { console.log(`  ${ok}/${tot} ${ok === tot ? 'LOLOS' : 'GAGAL'}\n`); return ok === tot; };
  console.log(`## ${name}`);
  return { t, done };
}

const BODY = { contents: [], generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } };

module.exports = { ...bundle, USAGE, mockDeps, suite, BODY };
