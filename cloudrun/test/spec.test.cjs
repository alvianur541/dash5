const { findSpecLines, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Real text (ZW140 chunk 9307): the HST pump values sit in a chunk titled "BATTERY".
const SPEC = 'Section: COMPONENT SPECS - BATTERY (Fan Pump, Fan Motor, Fan Valve, Hst Pump)\nModel: ZW140\nKategori: TECHNICAL MANUAL\nHST PUMP Type: Variable Displacement Axial Plunger Charge Pump: Trochoid Type\nHigh-Pressure Relief Valve Set Pressure .........44.6±1.0 MPa (455±10 kgf/cm2, 6480±145 psi)\nLow-Pressure Relief Valve Set Pressure..........2.5±0.1 MPa (26±1 kgf/cm2, 360±14.5 psi)';
// "HST" only in the intro; the pressure value 2 000 characters later belongs to something else.
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

  return done();
};
