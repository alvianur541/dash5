const { generateResponseStream, runWithDeps, mockDeps, suite, USAGE, biayaPanggilan } = require('./helpers.cjs');

const STOP = [[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]];
const dekat = (a, b) => Math.abs(a - b) < 1e-9;

module.exports = async function () {
  const { t, done } = suite('biaya: harga list per model, cache 10%, thinking tidak dobel');
  t(dekat(biayaPanggilan('gemini-3.7-flash', 1e6, 1e6, 0), 9.0), '3.7 flash 1M in + 1M out = $9');
  t(dekat(biayaPanggilan('gemini-3.5-flash-lite', 1e6, 1e6, 0), 2.8), 'flash-lite 1M in + 1M out = $2.80');
  t(dekat(biayaPanggilan('gemini-3.7-flash', 1e6, 0, 1e6), 0.15), 'input ter-cache = 10%');
  t(dekat(biayaPanggilan('model-baru', 1e6, 0, 0), 1.5), 'model tak dikenal = harga flash');

  const { d } = mockDeps(STOP, {
    generate: async () => ({ candidates: [{ content: { parts: [{ text: '{"shouldSearch":false,"searchType":"casual","optimizedQuery":"halo"}' }] } }] }),
  });
  await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', [], 'halo', () => {}));
  const u = d.usage;
  t(u.cost > 0, `biaya terkumpul per panggilan (${u.cost})`);
  t(u.output >= u.thinking, 'output sudah termasuk thinking');
  return done();
};
