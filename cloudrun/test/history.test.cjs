const { historyToContents, suite } = require('./helpers.cjs');

const LONG_ANSWER = [
  '## Analisa HST ZW140',
  'Halo Pak Alvianur, berikut penjelasan lengkap.',
  '| Part Number | Nama | Qty |',
  '|---|---|---|',
  '| 4648651 | Suction Strainer | 1 |',
  '| YA00033065 | Return Filter | 2 |',
  'Tekanan charge pump normal 2.8 MPa pada 2000 rpm.',
  'Langkah pemeriksaan:',
  ...Array.from({ length: 40 }, (_, i) => `${i + 1}. Periksa komponen nomor ${i + 1} dan pastikan kondisi sesuai standar pabrik dengan teliti dan hati-hati.`),
  'Kesimpulan: kemungkinan penyebab adalah flushing valve macet.',
].join('\n');

module.exports = async function () {
  const { t, done } = suite('history: ringkas pesan lama, budget total');

  const hist = [];
  for (let i = 0; i < 10; i++) {
    hist.push({ role: 'user', content: `pertanyaan ke-${i} tentang hst` });
    hist.push({ role: 'assistant', content: LONG_ANSWER });
  }
  const contents = historyToContents(hist);
  const total = contents.reduce((s, c) => s + c.parts[0].text.length, 0);
  t(total <= 14000, `total riwayat <= 14000 char (total=${total})`);
  t(contents.at(-1).parts[0].text.length >= 3000, 'pesan terakhir tetap utuh-ish (>= 3000 char)');
  const old = contents.find(c => c.role === 'model');
  t(old.parts[0].text.length <= 760, `pesan lama <= 760 char (len=${old.parts[0].text.length})`);
  t(/4648651/.test(old.parts[0].text) && /2\.8 MPa/.test(old.parts[0].text), 'pesan lama tetap bawa PN & angka');
  t(/Kesimpulan/.test(old.parts[0].text), 'pesan lama tetap bawa kesimpulan');
  t(!/\|---\|/.test(old.parts[0].text), 'pesan lama buang baris tabel');
  t(contents[0].role === 'user', 'urutan role dimulai dari user');

  const short = historyToContents([{ role: 'user', content: 'halo' }, { role: 'assistant', content: 'Halo, ada yang bisa dibantu?' }]);
  t(short[1].parts[0].text === 'Halo, ada yang bisa dibantu?', 'riwayat pendek tidak diubah');
  return done();
};
