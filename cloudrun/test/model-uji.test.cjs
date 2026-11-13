const { generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('model uji: hanya permintaan bertanda yang memakai model uji, cadangan tetap rantai biasa');
  const jalan = async (modelUji, script) => {
    const dipakai = [];
    const { d } = mockDeps(script, { modelUji });
    const stream = d.stream;
    d.stream = (body, model, cb, opts) => { dipakai.push(model); return stream(body, model, cb, opts); };
    const hasil = await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', [], 'halo', () => {}));
    return { dipakai, hasil, meta: d.meta };
  };
  const OK = [{ text: 'Halo, ada yang bisa dicek?', usageMetadata: USAGE, live: true, finishReason: 'STOP' }];

  const biasa = await jalan(null, [OK]);
  const uji = await jalan('gemini-4-hydrogen', [OK]);
  t(biasa.dipakai[0] !== 'gemini-4-hydrogen' && biasa.meta.modelUsed !== 'gemini-4-hydrogen', 'tanpa tanda uji → model produksi');
  t(uji.dipakai[0] === 'gemini-4-hydrogen' && uji.meta.modelUsed === 'gemini-4-hydrogen' && uji.hasil.includes('Halo'), 'bertanda uji → model uji menjawab dan tercatat');

  const gagal = await jalan('gemini-4-hydrogen', [[{ error: 'Upstream 404 NOT_FOUND', code: 404 }], OK]);
  t(gagal.dipakai[0] === 'gemini-4-hydrogen' && gagal.dipakai.at(-1) === biasa.dipakai[0] && gagal.hasil.includes('Halo')
    && gagal.meta.modelUsed === biasa.dipakai[0], 'model uji gagal → jatuh ke model produksi, teknisi tetap dapat jawaban');
  return done();
};
