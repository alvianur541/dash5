const { findComponentWeight, weightComponent, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

function fakeSupabase(rows, calls = []) {
  const q = {
    select() { return q; },
    contains(col, v) { calls.push(['contains', col, v]); return q; },
    ilike(col, v) { calls.push(['ilike', col, v]); return q; },
    limit() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) };
}

// Real DB text (chunk 7586): the PDF column split puts a sentence between "48" and "kg".
const MOTOR = { content: 'Section: SWING MOTOR - DISASSEMBLY\nModel: ZX200-5G\nKategori: WORKSHOP MANUAL\nd IMPORTANT: Do not damage the mating surfaces CAUTION: The swing motor assembly weight: 48 when separating valve plate (21) from valve kg (110 lb) casing (28)' };
const DEVICE = { content: 'Section: SWING DEVICE - REMOVAL & INSTALLATION\nModel: ZX200-5G\nKategori: WORKSHOP MANUAL\nCAUTION: Swing device (5) weight: 220 kg (490 lb)' };
const LEAK = { content: 'Section: MACHINE TEST - SWING MOTOR LEAKAGE\nModel: ZX200-5G\n2. Load the bucket with a weight equivalent to the weight standard' };

module.exports = async function () {
  const { t, done } = suite('berat komponen: baris CAUTION weight dicari literal');

  t(weightComponent('berat swing motor') === 'swing motor', '"berat swing motor" -> swing motor');
  t(weightComponent('berapa berat travel device zx200') === 'travel device', 'nama unit & "berapa" dibuang');
  t(weightComponent('swing motor beratnya berapa kg') === 'swing motor', 'komponen sebelum kata "beratnya"');
  t(weightComponent('berat pompa hidrolik') === 'pump hidrolik', 'pompa -> pump');
  t(weightComponent('unit tidak bisa swing') === null, 'tanpa kata berat -> null');

  {
    const calls = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([LEAK, DEVICE, MOTOR], calls) });
    const r = await runWithDeps(d, () => findComponentWeight('ZX200-5G', 'berat swing motor', DEVICE.content));
    t(r === MOTOR.content, 'chunk SWING MOTOR - DISASSEMBLY (48 kg) ikut, bukan uji kebocoran');
    t(calls.some(c => c[0] === 'ilike' && c[2] === '%swing%motor%weight%'), 'pencarian literal swing…motor…weight');
    t(calls.some(c => c[0] === 'contains' && c[2].Model === 'ZX200-5G'), 'difilter per unit');
    const dup = await runWithDeps(d, () => findComponentWeight('ZX200-5G', 'berat swing motor', MOTOR.content));
    t(dup === null, 'chunk yang sudah ada di konteks tidak digandakan');
    const none = await runWithDeps(d, () => findComponentWeight('ZX200-5G', 'cara buang angin swing motor', ''));
    t(none === null, 'bukan pertanyaan berat -> tidak menambah apa-apa');
  }

  return done();
};
