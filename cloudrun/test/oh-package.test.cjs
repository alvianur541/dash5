const fs = require('fs'), path = require('path');
const { pilihPnHarga, isShortFollowUp, suite } = require('./helpers.cjs');

// Alvian 7 Okt: chunk baru Kategori OH PACKAGE (paket overhaul/reseal per unit).
module.exports = async () => {
  const { t, done } = suite('OH package: semua item paket dicek harganya');
  const oh = fs.readFileSync(path.join(__dirname, 'fixtures-oh-zx200.txt'), 'utf8');
  const tm = pilihPnHarga(oh, ['harga paket OH travel motor']);
  t(tm.length === 12 && tm[0] === '4613831', `paket OH travel motor ZX200-5G → 12 item, urut nomor (${tm.length}: ${tm.slice(0, 3).join(',')})`);
  const eng = pilihPnHarga(oh, ['brp harga overhaul engine']);
  t(eng.length === 34 && eng[0] === '8981529060', `overhaul engine → 34 item (${eng.length})`);
  const cv = pilihPnHarga(oh, ['list part reseal control valve']);
  t(cv.length > 5, `reseal control valve → isi paket (${cv.length})`);
  const biasa = pilihPnHarga(oh, ['harga seal oil travel motor']);
  t(biasa.length < 12, `tanpa kata paket/OH → bukan seluruh paket (${biasa.length})`);
  const prior = [{ role: 'user', content: 'part number travel motor' }, { role: 'assistant', content: 'Mau paket overhaul juga?' }];
  t(!isShortFollowUp('harga paket OH travel motor', prior), 'short OH package request must not receive the one-small-table brevity directive');
  return done();
};
