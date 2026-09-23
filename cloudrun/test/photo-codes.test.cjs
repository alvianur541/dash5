const { extractCatalogCode, extractPartNumber, isPartsQuery, searchPhotoCodes, AC_CODE_RE, acRowRe, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

function fakeSupabase(rows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) };
}

const LUB = { metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content:
  'Section: LUBRICANT\n  HTCDH1C                | HAP ENG OIL DH 1 CAN                        | Normal: Rp 591.600        | Disc: 15%  | Promo: Rp 502.860\n'
  + '  HTCGL490P              | HAP GEAR OIL GL4 90 PAIL                   | Normal: Rp 2.228.900      | Disc: 15%  | Promo: Rp 1.894.565' };
const FILTER = { metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content:
  'Section: FILTER PARTS\n  YA00058283             | ELEMENT;ENGINE OIL FILTER                  | Normal: Rp 400.000        | Disc: 20%  | Promo: Rp 320.000' };
const PARTS = { metadata: { Model: 'ZX200-5G', Kategori: 'PARTS CATALOG' }, content:
  'Section: ENGINE OIL FILTER\n  01 | YA00058283 | ELEMENT;OIL FILTER | qty:1 | svc:S' };
const WM = { metadata: { Model: 'ZX200-5G', Kategori: 'WORKSHOP MANUAL' }, content: 'HTCDH1C | disebut di workshop manual' };

module.exports = async () => {
  const { t, done } = suite('foto daftar part & kode AC (19 Sep)');

  const ok = ['HTCDH1C', 'HTCGL490P', 'HAPDH1-GP', 'MOHD80W90D', 'SOS-IR', '4249339-F', 'YA00006560HP', '1033091HPB', '4S00509', '4S00509HPA', '9151537HD-HR', 'YA00002098', '4651654'];
  t(ok.every(c => extractCatalogCode(c) === c), `kode oli, coolant & bersufiks dikenali dari foto (${ok.length} contoh asli DB)`);
  t(extractCatalogCode(' htcdh1c ') === 'HTCDH1C', 'huruf kecil & spasi dari OCR dirapikan');
  const no = ['ZX200-5G', 'SAE10W', 'Rp 502.860', '2026', 'QTY', 'NONE', '15%'];
  t(no.every(c => extractCatalogCode(c) === null), 'nama unit, harga, tahun, persen BUKAN kode part');
  t(extractPartNumber('harga HTCDH1C') === null && !isPartsQuery('cek oli sae 10'), 'pola routing PART_NUMBER_RE TIDAK berubah (hanya jalur foto yang diperluas)');

  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase([LUB, FILTER, PARTS, WM]) });
    const r = await runWithDeps(d, () => searchPhotoCodes(['YA00058283', 'HTCDH1C', 'HTCGL490P', '4S00999'], 'ZX200-5G', () => {}));
    t(r && r.type === 'rag_found', 'foto 4 kode → rag_found');
    t(r.content.includes('Promo: Rp 502.860') && r.content.includes('Promo: Rp 1.894.565'), 'HARGA OLI ikut (kasus sesi 2744a780 / dd10f4aa / cd6b8114)');
    t(r.content.split('Section: LUBRICANT').length === 2, 'seksi LUBRICANT dipakai dua kode tapi cuma disisipkan SEKALI');
    t(r.content.indexOf('Section: FILTER PARTS') < r.content.indexOf('Section: ENGINE OIL FILTER'), 'seksi promo (ada harga) didahulukan dari katalog');
    t(!r.content.includes('disebut di workshop manual'), 'kategori non-katalog/promo tidak ikut');
    t(/\[KODE BELUM KETEMU DI PENCARIAN\]\n4S00999 —/.test(r.content) && /JANGAN bilang kode ini tidak terdaftar/.test(r.content), 'kode yang tak ketemu DISEBUT + larangan bilang "tidak terdaftar"');
    t(!/BELUM KETEMU[^\n]*\n[^\n]*HTCDH1C/.test(r.content), 'kode yang ketemu tidak ikut daftar "belum ketemu"');
  }
  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase([WM]) });
    const r = await runWithDeps(d, () => searchPhotoCodes(['HTCDH1C', 'YA00058283'], 'ZX200-5G', () => {}));
    t(r === null, 'nol kode ketemu → null (jalur lama menyambung: cari lewat nama komponen)');
  }

  t(['AC:51', 'ac:51', 'A/C 51', 'AC51', 'AC:5'].every(c => AC_CODE_RE.test(c)) && AC_CODE_RE.exec('AC:51')[1] === '51', 'kode AC dikenali, angkanya diambil');
  t(['13006-2', 'ENG:00436-04', 'AC:511', 'CA2769', '51'].every(c => !AC_CODE_RE.test(c)), 'fault code biasa & angka telanjang tidak dianggap kode AC');

  {
    const isiAc = 'AIR CONDITIONER - FAULT CODE LIST\n  Fault Code: 51 (Abnormal high/low refrigerant pressure)';
    t(!acRowRe('51').source.includes(String.fromCharCode(8)), 'pola baris AC tidak memuat backspace (backslash di template literal wajib ganda)');
    t(acRowRe('51').test(isiAc), 'baris kode AC di hasil pencarian dikenali');
    t(!acRowRe('51').test('PERFORMANCE STANDARD\n  Travel speed 5.1 km/h'), 'angka lain (5.1 km/h) tidak dianggap baris kode AC');
  }

  return done();
};
