const { pilihPnHarga, detectFaultCodeInQuery, BUKAN_HARGA_SAJA_RE, suite } = require('./helpers.cjs');

// Sesi Arip 4 Okt: "cek harga kit seal swing motor" dijawab bercampur seal kit main pump. Chunk promo
// "INNERPART HYDRAULIC (Main Pump, Swing Motor, ...)" — komponen tiap baris ada di tag [..] di ujung baris.
const PROMO = `Section: PROMO Q2 FY2026 - INNERPART HYDRAULIC (Main Pump, Swing Motor, Travel Motor, Control Valve) (Part 1/2)
  4451039                | Kit; Seal                                    |      Rp 3.163.459 |   25% |      Rp 2.372.594  [Main Pump]
  4455733                | Kit; Seal                                    |        Rp 424.903 |   25% |        Rp 318.677  [Main Pump]
  YB00000330             | Kit;Seal                                     |        Rp 760.233 |   25% |        Rp 570.175  [Main Pump]
  0788805                | Rotor                                        |     Rp 26.979.234 |   25% |     Rp 20.234.426  [Swing Motor]
  XB00010860             | Kit;Seal                                     |      Rp 2.803.588 |   25% |      Rp 2.102.691  [Swing Motor]
  4613831                | Seal;Oil                                     |        Rp 693.447 |   25% |        Rp 520.085  [Travel Motor]`;
const KATALOG = `Section: PUMP;UNIT
Parts List:
     100 | 4451039            | KIT;SEAL                            | qty:1
Section: ALTERNATOR
     1 | 8983413970         | ALTERNATOR                          | qty:1
Section: ENGINE ELECTRICAL
     2 | 8983413971         | ALTERNATOR                          | qty:1`;

module.exports = async () => {
  const { t, done } = suite('harga per komponen (sesi Arip)');
  const swing = pilihPnHarga(`${PROMO}\n${KATALOG}`, ['cek harga kit seal swing motor']);
  t(swing.includes('XB00010860') && !swing.some(p => ['4451039', '4455733', 'YB00000330'].includes(p)), `seal kit swing motor tanpa seal kit main pump (${swing.join(',')})`);
  const pump = pilihPnHarga(`${PROMO}\n${KATALOG}`, ['cek harga kit seal main pump']);
  t(['4451039', '4455733', 'YB00000330'].every(p => pump.includes(p)) && !pump.includes('XB00010860'), `seal kit main pump tanpa swing motor (${pump.join(',')})`);
  const alt = pilihPnHarga(KATALOG, ['harga alternator']);
  t(alt.includes('8983413970') && alt.includes('8983413971'), 'tanpa komponen tambahan di pertanyaan → semua section tetap ikut (alternator di 2 section)');
  t(!detectFaultCodeInQuery('SN 70015').isFaultCode && !detectFaultCodeInQuery('SERIAL NUMBERNY 70015').isFaultCode, '"SN 70015" = nomor seri, bukan fault code');
  t(detectFaultCodeInQuery('11006-2').isFaultCode, 'fault code biasa tetap terdeteksi');
  t(BUKAN_HARGA_SAJA_RE.test('yang mna yang betul ini') && BUKAN_HARGA_SAJA_RE.test('yg mana yg cocok'), '"yang mana yang betul" → model utama menjelaskan, bukan tabel yang sama diulang');
  return done();
};
