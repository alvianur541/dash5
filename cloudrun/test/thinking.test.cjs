const { generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

const STOP = [[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]];
const INTENT = JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'auto idle system not working' });

async function configFor(question) {
  let sent = null;
  const { d } = mockDeps(STOP, {
    generate: async () => ({ candidates: [{ content: { parts: [{ text: INTENT }] } }] }),
  });
  const stream = d.stream;
  d.stream = (body, model, cb, opts) => { sent = body; return stream(body, model, cb, opts); };
  await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', [], question, () => {}));
  return sent.generationConfig;
}

module.exports = async function () {
  const { t, done } = suite('thinking: semua low, diagnosa & penjelasan tetap dapat ruang token lebih');

  const santai = await configFor('halo');
  t(santai.thinkingConfig.thinkingLevel === 'low', `sapaan → low (${santai.thinkingConfig.thinkingLevel})`);
  t(santai.maxOutputTokens === 1536, `sapaan → batas 1536 tanpa tambahan (${santai.maxOutputTokens})`);

  const teknis = await configFor('auto idle ngga fungsi');
  t(teknis.thinkingConfig.thinkingLevel === 'low', `keluhan/diagnosa → low (${teknis.thinkingConfig.thinkingLevel})`);
  t(teknis.maxOutputTokens >= 2048 + 4096, `diagnosa → batas panjang jawaban tidak berkurang (${teknis.maxOutputTokens})`);

  const fungsi = await configFor('coba jelaskan fungsi dari regenerative valve');
  t(fungsi.thinkingConfig.thinkingLevel === 'low', `penjelasan cara kerja/fungsi → low (${fungsi.thinkingConfig.thinkingLevel})`);
  t(fungsi.maxOutputTokens >= 2048 + 4096, `penjelasan → batas panjang jawaban tidak berkurang (${fungsi.maxOutputTokens})`);

  const spec = await configFor('berat swing motor');
  t(spec.thinkingConfig.thinkingLevel === 'low', `cek angka/spec → low (${spec.thinkingConfig.thinkingLevel})`);
  t(spec.maxOutputTokens < 4096, `cek angka → tanpa tambahan token berpikir (${spec.maxOutputTokens})`);

  return done();
};
