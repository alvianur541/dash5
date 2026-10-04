const { callProxyStream, runWithDeps, resetPemutus, USAGE, suite, BODY, MODEL_CHAIN } = require('./helpers.cjs');

// Pemutus sirkuit (§12 #7): sesudah 429/hang, model utama dilewati 5 menit (4 Okt: 429 baru datang setelah 22,7 dtk).
const OK = 'Jawaban lengkap.';
function deps(perModel, models) {
  return {
    supabase: null, embed: async () => [], rerank: async () => ({ results: [] }), generate: async () => ({}),
    stream: async (_b, model, onChunk) => { models.push(model); for (const c of perModel(model)) onChunk(c); },
    usage: { input: 0, output: 0, calls: 0, thinking: 0, cached: 0 }, meta: {},
  };
}
const sehat = [{ text: OK, usageMetadata: USAGE, live: true, finishReason: 'STOP' }];

module.exports = async () => {
  const { t, done } = suite('pemutus sirkuit model');
  resetPemutus();
  const [UTAMA, CADANGAN] = MODEL_CHAIN;

  const m1 = [];
  await runWithDeps(deps(m => (m === UTAMA ? [{ error: 'Resource exhausted', code: 429 }] : sehat), m1), () => callProxyStream(BODY, () => {}));
  t(m1.join() === `${UTAMA},${CADANGAN}`, `pertanyaan pertama: ${UTAMA} 429 → ${CADANGAN}`);

  const m2 = [];
  const d2 = deps(() => sehat, m2);
  const r2 = await runWithDeps(d2, () => callProxyStream(BODY, () => {}));
  t(m2.join() === CADANGAN && r2 === OK, `pertanyaan berikutnya langsung ke ${CADANGAN} tanpa menunggu ${UTAMA} (${m2.join(' → ')})`);
  t(d2.meta.fallbackTo === CADANGAN && d2.meta.fallbackSebab === 'pemutus', 'tercatat di usage_logs sebagai fallback sebab "pemutus"');

  const m3 = [];
  await runWithDeps(deps(m => (m === CADANGAN ? [{ error: 'Resource exhausted', code: 429 }] : sehat), m3), () => callProxyStream(BODY, () => {}));
  t(m3.join() === `${CADANGAN},${UTAMA}`, `cadangan ikut 429 → model utama tetap dicoba sebagai cadangan (${m3.join(' → ')})`);

  resetPemutus();
  const m4 = [];
  await runWithDeps(deps(() => sehat, m4), () => callProxyStream(BODY, () => {}));
  t(m4.join() === UTAMA, 'sesudah masa sakit habis → kembali ke model utama');

  return done();
};
