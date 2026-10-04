const { promoAktif, tanpaHargaDb, PROMO_BERAKHIR, generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

// Promo berakhir → harga DB dibuang, harga hanya dari hexindoparts.com (Alvian, 3–4 Okt).
const CHUNK = [
  'Section: PROMO Q2 FY2026 - LUBRICANT (Engine Oil, Hydraulic Oil, Gear Oil, Grease) — Berlaku Semua Model',
  'Model: ZX200-5G',
  'Kategori: PROMO Q2 FY2026',
  'Document: PROMO_Q2.3_FY2026 (Hitachi Astrea Parts Promo Q2 FY2026 + Add Item)',
  '',
  'Periode Promo  : 15 Juli 2026 - 30 September 2026 (HOSE & LUBRICANT: 5 Agustus - 30 September 2026)',
  'Syarat         : Harga belum termasuk PPN. Pemesanan harus diinvoice dalam periode promo.',
  '',
  '  Part Number            | Description                                  |      Harga Normal |  Disc |       Harga Promo',
  '  --------------------------------------------------------------------------------------------------------------------',
  '  HTCDH1P                | HTC ENG OIL DH1 PAIL                         |      Rp 2.337.200 |   15% |      Rp 1.986.620',
  '  4658521                | Engine Oil Filter                            |        Rp 645.593 |   20% |        Rp 516.474',
  '',
  'Total: 2 part number dalam section ini.',
].join('\n');
const LAMA = '  HTCDH1P                | HTC ENG OIL DH1 PAIL                        | Normal: Rp 2.337.200      | Disc: 15%  | Promo: Rp 1.986.620';
const CPM = { metadata: { Model: 'ZX200-5G', Kategori: 'CPM' }, content:
  'Section: CPM MAINTENANCE SCHEDULE\nModel: ZX200-5G\nKategori: CPM\n\n  No   Part Description                           Part Number              500hr  1000hr  2000hr\n  1    Engine Oil Filter                          4658521                      1       1       1\n  2    Engine Oil                                 HTCDH1P                      1       1       1\n' };

function fakeSupabase(rpcRows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
  };
  return { from: () => q, rpc: (_n, args) => Promise.resolve({ data: rpcRows(args), error: null }) };
}

module.exports = async () => {
  const { t, done } = suite('promo berakhir: harga DB dibuang, harga dari hexindoparts.com');

  const jkt = iso => new Date(`${iso}+07:00`);
  t(promoAktif(jkt(`${PROMO_BERAKHIR}T23:59:00`)), 'hari terakhir promo (23:59 WIB) masih aktif');
  t(!promoAktif(new Date(jkt(`${PROMO_BERAKHIR}T23:59:00`).getTime() + 2 * 60_000)),
    'lewat tengah malam WIB → tidak aktif (zona waktu Jakarta, bukan UTC)');

  const out = tanpaHargaDb(CHUNK);
  t(!/Rp\s?\d/.test(out), 'semua harga DB (normal & promo) dibuang');
  t(/HTCDH1P\s+\| HTC ENG OIL DH1 PAIL\s*$/m.test(out) && out.includes('4658521'), 'PN + deskripsi tetap ada');
  t(!out.includes('Rp 1.986.620') && !out.includes('Rp 516.474'), 'harga promo dibuang');
  t(!/\d+%/.test(out) && !/Disc/i.test(out), 'kolom diskon dibuang');
  t(!/promo/i.test(out), `tidak ada kata "promo" tersisa (${(out.match(/.*promo.*/gi) || []).join(' / ')})`);
  t(/Part Number\s+\| Description\s*$/m.test(out), 'header tabel tanpa kolom harga');
  t(!/Syarat|Catatan/.test(out), 'baris syarat promo dibuang');
  t(out.includes('Section: DAFTAR PARTS - LUBRICANT') && out.includes('Total: 2 part number'), 'judul section & total tetap terbaca');
  t(tanpaHargaDb(LAMA).trim().endsWith('HTC ENG OIL DH1 PAIL'), 'format lama "Normal: … Promo: …" juga dibersihkan');
  const WEB = '[HARGA HEXINDOPARTS.COM — harga terkini toko online resmi Hexindo]\n  Part Number | Description | Harga\n  HTCDH1P | ENG OILDH1 PAIL | Rp 2.337.200';
  t(tanpaHargaDb(`${WEB}\n\n${CHUNK}`).startsWith(WEB), 'blok harga hexindoparts.com tidak ikut dibuang');
  t(tanpaHargaDb('Torque 245 N·m | Rp bukan harga') === 'Torque 245 N·m | Rp bukan harga', 'baris non-harga tidak disentuh');

  // End-to-end: paket service → isi yang dikirim ke model.
  const rpc = args => (args.filter.Kategori === 'CPM' ? [{ ...CPM, similarity: 0.9 }]
    : /^PROMO/.test(args.filter.Kategori || '') ? [{ metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content: CHUNK, similarity: 0.8 }] : []);
  let sent = null;
  const { d } = mockDeps([[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]],
    { supabase: fakeSupabase(rpc), embed: async () => [0.1] });
  const stream = d.stream;
  d.stream = (body, model, cb, opts) => { sent = body; return stream(body, model, cb, opts); };
  await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', [], 'Pket 2000', () => {}));
  const user = sent.contents[sent.contents.length - 1].parts.map(p => p.text).join('\n');
  const sys = sent.systemInstruction.parts[0].text;
  if (promoAktif()) {
    t(user.includes('Rp 1.986.620'), 'promo masih aktif → harga promo tetap dikirim');
  } else {
    t(!user.includes('Rp 2.337.200') && !user.includes('Rp 1.986.620'), 'paket 2000 tanpa web: tidak ada harga DB yang sampai ke model');
    t(!/Periode Promo|HARGA PROMO|\d+%/.test(user), 'paket 2000: tanpa periode, label, atau persen promo');
    t(sys.includes('Semua harga diambil dari hexindoparts.com') && !sys.includes('Cross-ref PROMO'), 'system prompt: harga hanya dari hexindoparts.com');
    t(/Ada harga di jawaban → WAJIB tabel, walau cuma 1 PN/.test(sys) && /Harga `Belum tersedia`/.test(sys), 'system prompt: jawaban harga wajib tabel (bisa disimpan jadi gambar), PN tanpa harga tetap jadi baris');
  }

  return done();
};
