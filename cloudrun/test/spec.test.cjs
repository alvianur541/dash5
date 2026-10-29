const { findSpecLines, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

const SPEC = 'Section: COMPONENT SPECS - BATTERY (Fan Pump, Fan Motor, Fan Valve, Hst Pump)\nModel: ZW140\nKategori: TECHNICAL MANUAL\nHST PUMP Type: Variable Displacement Axial Plunger Charge Pump: Trochoid Type\nHigh-Pressure Relief Valve Set Pressure .........44.6±1.0 MPa (455±10 kgf/cm2, 6480±145 psi)\nLow-Pressure Relief Valve Set Pressure..........2.5±0.1 MPa (26±1 kgf/cm2, 360±14.5 psi)';
const FAR = `Section: CONTROL SYSTEM - OUTLINE\nModel: ZW140\nThe HST control unit controls the machine.${' Lorem.'.repeat(300)}\nPilot Relief Valve Set Pressure .........3.7 MPa`;

function fakeSupabase(rows, calls = []) {
  const q = {
    select() { return q; },
    contains(col, v) { calls.push(['contains', v]); return q; },
    ilike(col, v) { calls.push(['ilike', v]); return q; },
    filter(col, op, v) { calls.push(['filter', op, v]); return q; },
    limit() { return q; },
    then(resolve) { return Promise.resolve({ data: rows.map(content => ({ content })), error: null }).then(resolve); },
  };
  return { from: () => q };
}

const ranker = score => async (_q, docs, n) => ({ results: docs.map((_, index) => ({ index, score })).slice(0, n), source: 'google' });

module.exports = async function () {
  const { t, done } = suite('nilai spesifikasi: baris "atribut … angka satuan" dekat nama komponen');

  {
    const calls = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([SPEC, FAR], calls), rerank: ranker(0.5) });
    const r = await runWithDeps(d, () => findSpecLines('ZW140', 'HST relief pressure', ''));
    t(r === SPEC, 'tekanan relief HST (Danang, 30 Sep) → chunk 9307 berjudul "BATTERY" ikut');
    t(calls.some(c => c[0] === 'ilike' && c[1] === '%hst%'), 'chunk wajib memuat nama komponen');
    t(calls.some(c => c[0] === 'filter' && c[1] === 'imatch' && c[2].startsWith('(relief')), 'database menyaring baris atribut + angka + satuan');
    t(!calls.some(c => c[0] === 'filter' && /\{\d+,(\d{3,})\}/.test(c[2]) && Number(c[2].match(/\{\d+,(\d+)\}/)[1]) > 255), 'regex database tanpa pengulangan > 255 (batas Postgres)');
    const dup = await runWithDeps(d, () => findSpecLines('ZW140', 'HST relief pressure', SPEC));
    t(dup === null, 'chunk yang sudah ada di konteks tidak digandakan');
  }

  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase([FAR]), rerank: ranker(0.5) });
    const r = await runWithDeps(d, () => findSpecLines('ZW140', 'HST relief pressure', ''));
    t(r === null, 'angka yang jauh dari nama komponen tidak dihitung');
  }

  {
    const calls = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([SPEC], calls), rerank: ranker(0.5) });
    const keluhan = await runWithDeps(d, () => findSpecLines('ZX200-5G', 'engine speed drops when traveling', ''));
    const berat = await runWithDeps(d, () => findSpecLines('ZX200-5G', 'swing motor weight', ''));
    t(keluhan === null && berat === null && calls.length === 0, 'keluhan & pertanyaan berat tidak memakai pencari ini');
  }

  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase([SPEC]), rerank: ranker(0.04) });
    const r = await runWithDeps(d, () => findSpecLines('ZW140', 'HST relief pressure', ''));
    t(r === null, 'skor reranker rendah (LOW) → tidak disisipkan');
  }

  {
    const AKI = 'Section: SPECIFICATIONS - ELECTRICAL\nModel: ZX48U-5A\nBATTERY Type 115D31L-MF\nVoltage 12 V\nCapacity 72 Ah or more (5-Hour Rate)';
    {
      const { d } = mockDeps([[]], { supabase: fakeSupabase([AKI]), rerank: ranker(0.057) });
      t(await runWithDeps(d, () => findSpecLines('ZX48U-5A', 'battery capacity ampere', '')) === AKI, 'nilai persis di baris komponen tetap dipakai walau skor 0,057');
    }
    {
      const calls = [];
      const { d } = mockDeps([[]], { supabase: fakeSupabase([AKI], calls), rerank: ranker(0.057) });
      t(await runWithDeps(d, () => findSpecLines('ZX200-5G', 'battery capacity ampere Kalau akinya ini pakai yang berapa ampere?', '')) === AKI, 'kalimat teknisi lengkap tetap menemukan kapasitas aki');
      t(!calls.some(c => c[0] === 'ilike' && /kalau|pakai|%ini%/.test(c[1])), 'kata percakapan bukan filter komponen wajib');
    }
    {
      const DECOY = n => `Section: DECOY ${n}\nBATTERY inspection\na\nb\nc\nd\nCapacity ${n} Ah`;
      const { d } = mockDeps([[]], { supabase: fakeSupabase([DECOY(1), DECOY(2), AKI]), rerank: async () => ({ results:[{index:0,score:.01},{index:1,score:.01}], source:'google' }) });
      t(await runWithDeps(d, () => findSpecLines('ZX48U-5A', 'battery capacity ampere', '')) === AKI, 'blok literal aman tetap dipakai meski tidak masuk top-2 Google');
    }
    {
      const { d } = mockDeps([[]], { supabase: fakeSupabase([AKI]), rerank: async () => ({ results: [], error: 'Google timeout' }) });
      t(await runWithDeps(d, () => findSpecLines('ZX48U-5A', 'battery capacity ampere', '')) === AKI, 'blok battery-capacity-Ah literal tetap dipakai saat reranker gagal');
    }
    {
      const SALAH = 'Section: MIXED\nBATTERY inspection\nPilot Relief Valve Set Pressure 3.7 MPa';
      const { d } = mockDeps([[]], { supabase: fakeSupabase([SALAH]), rerank: ranker(0.057) });
      t(await runWithDeps(d, () => findSpecLines('ZW140', 'battery pressure', '')) === null, 'nama komponen dekat angka milik komponen lain tidak lolos bypass skor rendah');
    }
    {
      const calls = [];
      const { d } = mockDeps([[]], { supabase: fakeSupabase([AKI], calls), rerank: ranker(0.057) });
      const q = 'Berapa kapasitas battery ZX48U-5A? Berikan satu nilai exact dan sumber manual. battery capacity ZX48U-5A';
      t(await runWithDeps(d, () => findSpecLines('ZX48U-5A', q, '')) === AKI, 'kalimat Indonesia "kapasitas battery" + intent Inggris → kapasitas aki ketemu');
      t(!calls.some(c => c[0] === 'ilike' && /kapasitas|zx48u|berikan|nilai|exact|sumber|manual/.test(c[1])), 'kata atribut Indonesia, kode unit & kata perintah bukan filter komponen');
    }
    for (const [q, attr] of [['tegangan aki berapa', 'voltage'], ['torsi baut swing bearing', 'torque'], ['tekanan relief hst', 'relief']]) {
      const calls = [];
      const { d } = mockDeps([[]], { supabase: fakeSupabase([], calls), rerank: ranker(0.5) });
      await runWithDeps(d, () => findSpecLines('ZW140', q, ''));
      t(calls.some(c => c[0] === 'filter' && c[2].includes(attr)), `kata Indonesia "${q.split(' ')[0]}" dikenali sebagai atribut ${attr}`);
    }
    for (const q of ['battery ampere capacity', 'akinya berapa ampere', 'battery Ah rating']) {
      const calls = [];
      const { d } = mockDeps([[]], { supabase: fakeSupabase([AKI], calls), rerank: ranker(0.5) });
      const r = await runWithDeps(d, () => findSpecLines('ZX48U-5A', q, ''));
      t(r === AKI, `aki/battery Ah ketemu dari manual: "${q}"`);
      t(calls.some(c => c[0] === 'ilike' && c[1] === '%battery%') && !calls.some(c => c[0] === 'ilike' && /ampere|akinya|%ah%|rating/.test(c[1])), `komponen = battery, bukan kata satuan (${q})`);
    }
  }

  return done();
};
