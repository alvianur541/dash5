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
  const { t, done } = suite('thinking: obrolan ringan low, pertanyaan teknis medium (+ruang token berpikir)');

  const santai = await configFor('halo');
  t(santai.thinkingConfig.thinkingLevel === 'low', `sapaan → low (${santai.thinkingConfig.thinkingLevel})`);
  t(santai.maxOutputTokens === 1536, `sapaan → batas 1536 tanpa tambahan (${santai.maxOutputTokens})`);

  const teknis = await configFor('auto idle ngga fungsi');
  t(teknis.thinkingConfig.thinkingLevel === 'medium', `pertanyaan teknis → medium (${teknis.thinkingConfig.thinkingLevel})`);
  t(teknis.maxOutputTokens >= 2048 + 4096, `pertanyaan teknis → batas ditambah 4096 untuk berpikir (${teknis.maxOutputTokens})`);

  return done();
};
