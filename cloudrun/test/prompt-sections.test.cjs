const { SYSTEM_PROMPT, generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

const HEADS = ['# PARTS & ', '# FAULT CODE', '# SUMBER EKSTERNAL', '# GAMBAR'];
const NONE = { parts: false, fault: false, web: false, image: false };

module.exports = async function () {
  const { t, done } = suite('prompt: data-specific sections only when needed, shared prefix stays cacheable');
  for (const m of ['ZX48U-5A', 'ZX200-5G', 'KCM 60ZV', 'ZW140']) {
    const full = SYSTEM_PROMPT(m);
    const min = SYSTEM_PROMPT(m, undefined, NONE);
    t(HEADS.every(h => full.includes(h)) && HEADS.every(h => !min.includes(h)), `${m}: default keeps all sections, minimal drops them`);
    t(full.startsWith(min) && min.includes('ATURAN MUTLAK — ANTI-HALU'), `${m}: minimal prompt is a prefix of the full one and keeps anti-halu`);
    t(min.length < full.length * 0.8, `${m}: minimal prompt is at least 20% shorter (${min.length}/${full.length})`);
  }
  t(SYSTEM_PROMPT('ZX200-5G', undefined, { ...NONE, parts: true }).includes('# PARTS & '), 'parts flag adds only the parts section');
  const base = SYSTEM_PROMPT('ZX200-5G', undefined, NONE);
  t(!base.includes('リリーフ弁') && SYSTEM_PROMPT('ZX200-5G', undefined, { ...NONE, ja: true }).includes('リリーフ弁') && SYSTEM_PROMPT('ZX200-5G').includes('リリーフ弁'),
    'Japanese glossary only rides along for Japanese sessions and photos');
  t(base.trimEnd().split('\n# ').pop().startsWith('BENTUK & PANJANG JAWABAN') && !/\r/.test(base),
    'answer shape rules close the shared prompt');
  t(['1. **Quote VERBATIM', '8. **SELF-CHECK', '14. **Alat diagnosa', 'LANGKAH CEK — format wajib', '# KALAU DATA TIDAK ADA'].every(s => base.includes(s)),
    'anti-halu rules and diagnosis format survive the rewrite');

  let sent = null;
  const { d } = mockDeps([[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], {
    generate: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'auto idle not working' }) }] } }] }),
  });
  const stream = d.stream;
  d.stream = (body, model, cb, opts) => { sent = body.systemInstruction.parts[0].text; return stream(body, model, cb, opts); };
  await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', [], 'auto idle ngga fungsi', () => {}));
  t(sent?.includes('# SUMBER EKSTERNAL') && !sent.includes('# PARTS & ') && !sent.includes('# FAULT CODE') && !sent.includes('# GAMBAR'),
    'web answer without parts/fault data sends only the web section');
  return done();
};
