const { suite } = require('./helpers.cjs');
const { demoLimit, _resetDemo } = require('../server/auth');

async function jalan(email, authToken) {
  let lolos = false, status = 200, body = null;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  await demoLimit({ authUser: { email }, authToken }, res, () => { lolos = true; });
  return { lolos, status, body };
}

module.exports = async () => {
  const { t, done } = suite('batas akun demo H000');
  _resetDemo();
  let ok = 0;
  for (let i = 0; i < 10; i++) if ((await jalan('h000@dash5.internal')).lolos) ok++;
  t(ok === 10, '10 pertanyaan pertama akun demo lolos');
  const r = await jalan('H000@dash5.internal');
  t(!r.lolos && r.status === 429 && /DEMO_LIMIT/.test(r.body.error), 'pertanyaan ke-11 ditolak 429 DEMO_LIMIT');
  _resetDemo();
  let biasa = 0;
  for (let i = 0; i < 30; i++) if ((await jalan('h0001846@dash5.internal')).lolos) biasa++;
  t(biasa === 30, 'akun teknisi biasa tidak dibatasi');
  // Hitungan Supabase menang atas memori (semua instance berbagi angka yang sama).
  _resetDemo(async () => 11);
  const dbPenuh = await jalan('h000@dash5.internal', 'tok');
  _resetDemo(async () => null);
  const dbMati = await jalan('h000@dash5.internal', 'tok');
  _resetDemo();
  t(!dbPenuh.lolos && dbPenuh.status === 429, 'hitungan database 11 → ditolak walau memori baru 1');
  t(dbMati.lolos, 'RPC belum ada / gagal → pakai hitungan memori');
  return done();
};
