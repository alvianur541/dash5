const { pilihPnHarga, suite } = require('./helpers.cjs');

// Abdul 4 Okt: foto turun mesin (piston, conrod, main bearing, injection pump) — 14 slot habis oleh injection pump.
module.exports = async () => {
  const { t, done } = suite('harga multi-komponen dari foto: slot dibagi rata per komponen');
  const sec = (judul, rows) => `Section: ${judul}\nParts List:\n${rows.map(([pn, n], i) => `       ${String(i + 1).padStart(3, '0')} | ${pn} | ${n} | qty:1`).join('\n')}`;
  const inj = sec('080 - INJECTION PUMP', Array.from({ length: 16 }, (_, i) => [`11560${String(i).padStart(5, '0')}`, i % 2 ? 'PUMP ASM; INJ' : 'PLUNGER; INJ PUMP']));
  const crank = sec('015 - CRANKSHAFT,PISTON AND FLYWHEEL', [['8973585740', 'PISTON'], ['1122301292', 'ROD ASM; CONN'], ['9122716080', 'METAL SET; CONN ROD,STANDARD']]);
  const r = pilihPnHarga(`${inj}\n\n---\n\n${crank}`, ['harga Cek donk piston, connecting rod, main bearing, injection pump']);
  t(['8973585740', '1122301292'].every(pn => r.includes(pn)), `piston & conrod ikut dicek walau injection pump banyak baris (${r.length} PN)`);
  t(r.some(pn => pn.startsWith('11560')), 'injection pump tetap kebagian');
  t(pilihPnHarga(inj, ['harga injection pump']).length > 0, 'satu komponen: perilaku lama');
  {
    // Alvian 5 Okt: "nepple grease adjuster" → baris katalog VALVE di section ADJUSTER (20 baris) tak terpilih.
    const adj = sec('ADJUSTER', [...Array.from({ length: 18 }, (_, i) => [`47${String(i).padStart(5, '0')}`, i % 2 ? 'BOLT' : 'SPRING']), ['YA00020592', 'VALVE'], ['YA00026375', 'VALVE']]);
    const r2 = pilihPnHarga(adj, ['Cek harga nepple grease adjuster']);
    t(r2.slice(0, 4).includes('YA00020592'), `istilah bengkel "nepple" → VALVE didahulukan (${r2.slice(0, 3).join(',')})`);
  }
  return done();
};
