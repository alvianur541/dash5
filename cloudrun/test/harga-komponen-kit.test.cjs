const { suite } = require('./helpers.cjs');

module.exports = async () => {
  const { t, done } = suite('harga: PN yang dicek per komponen');
  {
    const { pilihPnHarga } = require('./helpers.cjs');
    const arm = require('fs').readFileSync(require('path').join(__dirname, 'fixtures-arm-zx48.txt'), 'utf8');
    const r = pilihPnHarga(arm, ['Sealkit arm cylinder hrga brpa']);
    t(r[0] === 'YD00005193', `"Sealkit" (satu kata) → KIT;SEAL YD00005193 dipilih pertama (${r.slice(0, 3).join(',')})`);
  }
  {
    const { pilihPnHarga } = require('./helpers.cjs');
    const st = 'Section: 082 - STARTER\nParts List:\n       010 | 8983763930     | STARTER ASM                            | qty:1\n       020 | 1811297750     | KIT;SEAL                               | qty:1\n       030 | 8981550400     | YOKE                                   | qty:1\n       040 | 1811210620     | ARMATURE                               | qty:1\n       050 | 8981971750     | BRUSH;STARTER                          | qty:2';
    const r = pilihPnHarga(st, ['Klo harga starter berapa']);
    t(r.join() === '8983763930', `"harga starter" → cukup STARTER ASM (${r.join(',')})`);
    const r2 = pilihPnHarga(st, ['harga brush starter']);
    t(r2.includes('8981971750'), `"harga brush starter" → brush tetap dicari (${r2.join(',')})`);
    const r3 = pilihPnHarga(st, ['harga komponen internal starter']);
    const r4 = pilihPnHarga(st, ['Oke', 'starter motor harga'], 'Tabel... Mau sekalian saya listkan harga komponen internalnya (seal kit, brush, armature)?');
    t(r4.length > 1, `"Oke" setelah tawaran komponen internal → isi dicek (${r4.length} PN)`);
    t(r3.length > 1, `"komponen internal starter" → isi dicek (${r3.length} PN)`);
  }
  return done();
};
