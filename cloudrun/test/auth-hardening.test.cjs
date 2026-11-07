const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { suite } = require('./helpers.cjs');

function muat(fetchImpl) {
  const module = { exports: {} };
  const config = { ...require('../server/config'), SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'fixture', AUTH_CACHE_TTL_MS: 60000, RATE_LIMIT_PER_MIN: 150, MAX_INFLIGHT_PER_USER: 3 };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/auth.js'), 'utf8'), {
    module, require: () => config, console, AbortSignal, Buffer, Date, fetch: fetchImpl,
  });
  return module.exports;
}

const resPalsu = () => {
  const r = new EventEmitter();
  r.headers = {};
  r.status = n => { r.kode = n; return r; };
  r.json = () => r;
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.sendStatus = n => { r.kode = n; };
  return r;
};

module.exports = async () => {
  const { t, done } = suite('pengerasan auth: token sampah, cache tolak, batas berjalan, header API');

  let panggil = 0;
  const auth = muat(async () => { panggil++; return { ok: false, status: 401, json: async () => ({}) }; });
  const cek = async token => { const res = resPalsu(); let lolos = false; await auth.verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, () => { lolos = true; }); return { lolos, kode: res.kode }; };

  const sampah = await cek('bukan-jwt');
  t(!sampah.lolos && sampah.kode === 401 && panggil === 0, 'token bukan bentuk JWT ditolak tanpa memanggil Supabase');
  const jwtPalsu = 'aaa.bbb.ccc';
  await cek(jwtPalsu); await cek(jwtPalsu); await cek(jwtPalsu);
  t(panggil === 1, `token JWT yang ditolak Supabase di-cache singkat → 3 percobaan = 1 panggilan (${panggil})`);

  const batas = [];
  for (let i = 0; i < 4; i++) {
    const res = resPalsu();
    let lanjut = false;
    auth.rateLimit({ authUser: { id: 'u1' } }, res, () => { lanjut = true; });
    batas.push({ res, lanjut });
  }
  t(batas.slice(0, 3).every(b => b.lanjut) && !batas[3].lanjut && batas[3].res.kode === 429, 'permintaan berjalan ke-4 dari akun yang sama ditolak 429');
  batas[0].res.emit('close');
  const res5 = resPalsu();
  let lanjut5 = false;
  auth.rateLimit({ authUser: { id: 'u1' } }, res5, () => { lanjut5 = true; });
  t(lanjut5, 'setelah satu selesai, slot terbuka lagi');
  let lainLanjut = false;
  auth.rateLimit({ authUser: { id: 'u2' } }, resPalsu(), () => { lainLanjut = true; });
  t(lainLanjut, 'akun lain tidak terdampak');

  const app = { disable() {}, use(fn) { this.fn = fn; } };
  auth.securityHeaders(app);
  const r = resPalsu();
  app.fn({ headers: {}, method: 'GET' }, r, () => {});
  t(r.headers['x-frame-options'] === 'DENY' && /frame-ancestors 'none'/.test(r.headers['content-security-policy'] || '') && r.headers['referrer-policy'] === 'no-referrer', 'respons API membawa X-Frame-Options, CSP frame-ancestors, Referrer-Policy');

  return done();
};
