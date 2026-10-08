const { suite } = require('./helpers.cjs');
const { demoLimit, _resetDemo } = require('../server/auth');

function jalan(email) {
  let lolos = false, status = 200, body = null;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  demoLimit({ authUser: { email } }, res, () => { lolos = true; });
  return { lolos, status, body };
}

module.exports = async () => {
  const { t, done } = suite('batas akun demo H000');
  _resetDemo();
  let ok = 0;
  for (let i = 0; i < 10; i++) if (jalan('h000@dash5.internal').lolos) ok++;
  t(ok === 10, '10 pertanyaan pertama akun demo lolos');
  const r = jalan('H000@dash5.internal');
  t(!r.lolos && r.status === 429 && /DEMO_LIMIT/.test(r.body.error), 'pertanyaan ke-11 ditolak 429 DEMO_LIMIT');
  _resetDemo();
  let biasa = 0;
  for (let i = 0; i < 30; i++) if (jalan('h0001846@dash5.internal').lolos) biasa++;
  t(biasa === 30, 'akun teknisi biasa tidak dibatasi');
  return done();
};
