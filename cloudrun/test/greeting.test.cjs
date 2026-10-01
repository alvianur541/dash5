const { generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

const STOP = [[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]];

async function tagFor(history) {
  let sent = null;
  const { d } = mockDeps(STOP);
  const stream = d.stream;
  d.stream = (body, model, cb, opts) => { sent = body; return stream(body, model, cb, opts); };
  await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', history, 'halo', () => {}));
  return sent.contents.at(-1).parts[0].text.split('\n')[0];
}

module.exports = async function () {
  const { t, done } = suite('sapaan: jawaban lanjutan ditandai supaya salam & nama tidak berulang');

  const pertama = await tagFor([]);
  t(pertama.startsWith('[Teknisi: Alvianur') && !pertama.includes('Jawaban lanjutan'), 'jawaban pertama: tanpa penanda (boleh salam)');

  const lanjut = await tagFor([{ role: 'user', content: 'auto idle ngga fungsi' }, { role: 'assistant', content: 'Langkah 1 …' }]);
  t(lanjut.includes('Jawaban lanjutan: JANGAN buka dengan salam waktu atau nama'), 'jawaban berikutnya: ditandai lanjutan');

  return done();
};
