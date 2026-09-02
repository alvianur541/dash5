const { SERVICE_INTERVAL_RE, extractCpmPartsForInterval, suite } = require('./helpers.cjs');

const CPM_FIXTURE = `Section: CPM MAINTENANCE SCHEDULE - TEST
Model: TEST
Kategori: CPM

  No   Part Description                           Part Number              500hr  1000hr  1500hr  2000hr  2500hr  3000hr  3500hr  4000hr
  1    Engine Oil Filter                          AA00000001                   1       1       1       1       1       1       1       1
  2    Primary Fuel Filter                        1000001                      1       1       1       1       1       1       1       1
  4    Air Cleaner Element outer                  AA00000004                   -       1       -       1       -       1       -       1
  6    Hydraulic Return Filter / High performance filter AA00000006                   -       1       -       1       -       1       -       1
  8    Air Breather Element                       1000008                      -       -       -       -       -       -       -       1
  15   SAMP BOTTLE KIT                            SAMPLING KIT ID              -       -       -       -       -       -       -       5
  17   Coolant                                    LLC PREMIX 20L               -       -       -       -       -       -       -       1
`;

module.exports = async function () {
  const { t, done } = suite('service interval: router regex + CPM parser');

  const harus = [
    ['Cek untuk service 2000 partny', '2000'], ['service 2000 jam', '2000'], ['parts yang diganti 1000 jam ZX200', '1000'],
    ['servis 500', '500'], ['PM 1000 apa saja partnya', '1000'], ['maintenance 2000 butuh part apa', '2000'],
    ['perawatan 250 jam', '250'], ['service 2000 hr', '2000'], ['part service 3000', '3000'], ['2000 hm parts', '2000'],
  ];
  const jangan = ['harga seal kit swing', 'PN YB60000068', 'kapasitas oli mesin', 'fault code 13006-2',
    'tekanan main pump 34.3 MPa', 'berat operating 20000 kg', 'service manual halaman berapa', 'kapan service berikutnya'];
  for (const [q, exp] of harus) {
    const m = q.match(SERVICE_INTERVAL_RE); const got = m ? (m[1] ?? m[2]) : null;
    t(got === exp, `regex hits "${q}" -> ${got}`);
  }
  for (const q of jangan) t(!SERVICE_INTERVAL_RE.test(q), `regex ignores "${q}"`);

  const pn = (h) => extractCpmPartsForInterval(CPM_FIXTURE, h).split('\n').filter(Boolean).map(l => l.split('|')[0].trim());
  const p500 = pn(500), p2000 = pn(2000), p4000 = pn(4000);
  t(p500.length === 2 && p500.includes('AA00000001') && p500.includes('1000001'), `500h: 2 parts (${p500.length})`);
  t(p2000.length === 4 && p2000.includes('AA00000006'), `2000h: 4 parts incl. colliding-column PN (${p2000.length})`);
  t(!p2000.includes('LLC PREMIX 20L'), '2000h: coolant (4000h-only) excluded');
  t(p4000.length === 7 && p4000.includes('SAMPLING KIT ID') && p4000.includes('LLC PREMIX 20L'), `4000h: 7 parts incl. spaced PNs (${p4000.length})`);
  t(extractCpmPartsForInterval(CPM_FIXTURE, 750) === '', 'unknown interval -> empty');
  t(extractCpmPartsForInterval('no header here', 500) === '', 'no CPM header -> empty');
  return done();
};
