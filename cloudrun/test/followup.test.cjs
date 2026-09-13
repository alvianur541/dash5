const { extractSectionReferences, carryForwardTopic, hasTopicTerm, contextTurns, wantsNumeric, suite } = require('./helpers.cjs');

const U = (content, id = '1') => ({ id, role: 'user', content, timestamp: Number(id) });
const A = (content, id = '2') => ({ id, role: 'assistant', content, timestamp: Number(id) });

// Chunk asli ZX200-5G: prosedur ukur tanpa satu pun angka, ditutup pointer ke tabel.
const MACHINE_TEST = [
  'Section: MACHINE TEST - HYDRAULIC CYLINDER CYCLE TIME',
  'Model: ZX200-5G',
  '',
  'Hydraulic Cylinder Cycle Time',
  'Measure the cycle time of boom, arm and bucket cylinder.',
  'Evaluation: Refer to Operational Performance Standard.',
].join('\n');

module.exports = async function () {
  const { t, done } = suite('followup: pointer "Refer to" + pewarisan topik');

  // --- extractSectionReferences ---
  t(extractSectionReferences(MACHINE_TEST)[0] === 'Operational Performance Standard',
    `machine test → ${extractSectionReferences(MACHINE_TEST)[0]}`);
  t(extractSectionReferences('Remedy: Refer to the Performance Standard Table in Group T4-2.')[0]
    === 'Performance Standard Table', 'buang ekor "in Group T4-2"');
  // Bentuk nyata di korpus: nomor halaman hilang saat ingest, menyisakan "on .)".
  t(extractSectionReferences('(Refer to BLEED AIR FROM HYDRAULIC OIL TANK on .) 2. Remove bolts (5)')[0]
    === 'BLEED AIR FROM HYDRAULIC OIL TANK', 'buang preposisi menggantung');
  t(extractSectionReferences('Refer to ADJUST TRACK SAG on W1-4-1.')[0] === 'ADJUST TRACK SAG',
    'buang ekor kode halaman');
  t(extractSectionReferences('Refer to Troubleshooting B.')[0] === 'Troubleshooting B', 'Troubleshooting B');

  for (const noise of [
    'Refer to W1-4-1.',
    'Refer to T4-5 in the separated volume, T/M.',
    'Refer to the illustration.',
    'Refer to the table.',
    'Refer to the right illustration.',
    'Refer to the operator’s manual.',
    'Refer to Engine.',
    'Refer to COMPONENT.',
  ]) {
    t(extractSectionReferences(noise).length === 0, `diabaikan: ${noise}`);
  }

  // Kalau section-nya sudah ikut terambil, pass kedua mubazir.
  const sudahAda = `${MACHINE_TEST}\n\n---\n\nSection: PERFORMANCE STANDARD - MAIN TABLE\nOperational Performance Standard Table: Boom Raise 3.4±0.3 s`;
  t(extractSectionReferences(sudahAda).length === 0, 'section sudah ada di konteks → tidak ditelusuri');

  t(extractSectionReferences('Refer to Operational Performance Standard. Refer to Troubleshooting B.').length === 1,
    'maksimal satu pass kedua');
  t(extractSectionReferences('tidak ada rujukan apa pun di sini').length === 0, 'tanpa pointer → kosong');

  // --- carryForwardTopic ---
  const H = [U('Cek data cycle time cylinder'), A('Berikut prosedur pengukuran...')];
  t(carryForwardTopic('', 'Brpa nilainy', H) === 'cycle time cylinder',
    `"Brpa nilainy" → ${carryForwardTopic('', 'Brpa nilainy', H)}`);
  t(carryForwardTopic('', 'Coba cari', H) === 'cycle time cylinder', 'follow-up "Coba cari" mewarisi topik');
  t(carryForwardTopic('value', 'Brpa nilainy', H) === 'cycle time cylinder', 'optimizedQuery tipis ikut diwarisi');

  t(carryForwardTopic('swing motor weight', 'berapa berat swing motor', H) === 'swing motor weight',
    'query yang sudah menyebut komponen tidak diutak-atik');
  t(carryForwardTopic('hydraulic pump no suction', 'pompanya nggak narik', H) === 'hydraulic pump no suction',
    'query panjang tidak diutak-atik');
  t(carryForwardTopic('', 'Coba cari', []) === '', 'tanpa history → apa adanya');
  t(carryForwardTopic('', 'Coba cari', [U('halo bro')]) === '', 'history tanpa topik teknis → apa adanya');

  const H2 = [U('Cek data cycle time cylinder'), A('...'), U('Brpa nilainy'), A('...')];
  t(carryForwardTopic('', 'Coba cari', H2) === 'cycle time cylinder',
    'lewati turn user yang juga tanpa topik');

  // --- hasTopicTerm ---
  t(hasTopicTerm('cycle time cylinder') === true, 'cylinder = kata teknis');
  t(hasTopicTerm('berapa nilainya') === false, 'basa-basi bukan topik');
  t(hasTopicTerm('berat swing motor') === true, 'berat = atribut spec');

  // --- konteks intent: jawaban gagal tidak diwariskan ---
  const GAGAL = 'Nilai standar cycle time tidak tercantum di data yang saya akses. '
    + 'Data yang tersedia memuat relief set pressure 34.3 MPa.';
  const ctx = contextTurns([U('Cek data cycle time cylinder'), A(GAGAL)], 6, m => m.content);
  t(!ctx.includes('relief'), 'jawaban "tidak tercantum" dibuang dari konteks');
  t(ctx.includes('cycle time cylinder'), 'pertanyaan user tetap jadi konteks');

  const ctxOk = contextTurns([U('berat swing motor'), A('Berat swing device 310 kg.')], 6, m => m.content);
  t(ctxOk.includes('310 kg'), 'jawaban berisi tetap dipakai');
  t(contextTurns([], 6, m => m.content) === '', 'history kosong → string kosong');

  // --- niat numerik bertahan walau kata tanya sudah di-strip ---
  t(wantsNumeric('brp nilainya') === true, 'singkatan "brp nilainya"');
  t(wantsNumeric('standarnya berapa') === true, 'imbuhan "standarnya"');
  t(wantsNumeric('spek pompa') === true, 'spek');
  t(wantsNumeric('swing motor weight') === true, 'atribut spec tetap kebaca');
  t(wantsNumeric('cara bongkar swing motor') === false, 'prosedur bukan permintaan angka');

  return done();
};
