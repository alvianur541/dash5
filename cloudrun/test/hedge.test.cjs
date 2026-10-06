const { callProxyStream, runWithDeps, resetPemutus, USAGE, suite, BODY, MODEL_CHAIN } = require('./helpers.cjs');

// Alvian 6 Okt: 3.7 Flash diam 45 dtk tanpa header, jawaban baru keluar 54 dtk.
module.exports = async () => {
  const { t, done } = suite('hedge model cadangan saat model utama diam');
  resetPemutus();
  process.env.HEDGE_MS = '60';
  const [UTAMA, CADANGAN] = MODEL_CHAIN;
  const models = []; let utamaDibatalkan = false;
  const d = {
    supabase: null, embed: async () => [], rerank: async () => ({ results: [] }), generate: async () => ({}),
    stream: (_b, model, onChunk, { signal }) => {
      models.push(model);
      if (model === UTAMA) return new Promise(res => signal.addEventListener('abort', () => { utamaDibatalkan = true; res(); }));
      onChunk({ text: 'Jawaban cadangan.', usageMetadata: USAGE, live: true, finishReason: 'STOP' });
      return Promise.resolve();
    },
    usage: { input: 0, output: 0, calls: 0, thinking: 0, cached: 0 }, meta: {},
  };
  const t0 = Date.now();
  const r = await runWithDeps(d, () => callProxyStream(BODY, () => {}));
  const ms = Date.now() - t0;
  t(r === 'Jawaban cadangan.' && models.join() === `${UTAMA},${CADANGAN}`, `cadangan dikirim paralel dan dipakai (${models.join(' → ')})`);
  t(utamaDibatalkan, 'koneksi model utama dibatalkan setelah cadangan menjawab');
  t(ms < 2000, `tidak menunggu batas 45 dtk (${ms} ms)`);
  t(d.meta.fallbackTo === CADANGAN && d.meta.fallbackSebab === 'hedge', 'tercatat fallback sebab "hedge"');

  resetPemutus();
  const m2 = [];
  const d2 = { ...d, meta: {}, stream: (_b, model, onChunk) => { m2.push(model); return new Promise(res => setTimeout(() => { onChunk({ text: 'Utama.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }); res(); }, 10)); } };
  const r2 = await runWithDeps(d2, () => callProxyStream(BODY, () => {}));
  t(r2 === 'Utama.' && m2.join() === UTAMA, 'model utama yang cepat tidak memicu cadangan');
  delete process.env.HEDGE_MS;
  return done();
};
