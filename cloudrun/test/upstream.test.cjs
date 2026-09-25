const { suite } = require('./helpers.cjs');
const { fetchAntiMacet, STALL_MAX } = require('../server/upstream');

// rencana[i] = { ms, gagal?, status? } untuk panggilan fetch ke-i
function pasangFetch(rencana) {
  const catat = [];
  global.fetch = (_url, opts) => {
    const i = catat.length;
    const r = rencana[Math.min(i, rencana.length - 1)];
    catat.push({ dibatalkan: false });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => (r.gagal ? reject(new Error('gagal-' + i)) : resolve({ ke: i, status: r.status || 200 })), r.ms);
      opts.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        catat[i].dibatalkan = true;
        reject(new Error('AbortError'));
      });
    });
  };
  return catat;
}

module.exports = async () => {
  const { t, done } = suite('upstream — adu balap koneksi (hedged)');
  const fetchAsli = global.fetch;
  const warnAsli = console.warn;
  console.warn = () => {};
  const STALL = 60;

  {
    const catat = pasangFetch([{ ms: 10 }]);
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    await new Promise(r => setTimeout(r, STALL * 2));
    t(res.ke === 0 && catat.length === 1, 'koneksi cepat menang — cadangan TIDAK dikirim');
  }

  {
    const catat = pasangFetch([{ ms: 5000 }, { ms: 10 }]);
    const mulai = Date.now();
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    const lama = Date.now() - mulai;
    t(res.ke === 1 && lama < 2000, 'koneksi 1 menggantung → cadangan dikirim & menang');
    t(catat[0].dibatalkan === true, 'koneksi yang kalah DIBATALKAN (tidak dobel bayar keluaran)');
  }

  {
    const catat = pasangFetch([{ ms: STALL * 2 }, { ms: 5000 }]);
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    t(res.ke === 0, 'koneksi 1 lambat tapi selesai duluan → TETAP dipakai, tidak dibuang');
    t(catat[1].dibatalkan === true, 'cadangan yang kalah ikut dibatalkan');
  }

  {
    pasangFetch([{ ms: 5 , gagal: true }, { ms: 5 }]);
    const mulai = Date.now();
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    t(res.ke === 1 && Date.now() - mulai < STALL, 'koneksi gagal cepat → pengganti langsung, tanpa menunggu ambang');
  }

  {
    const catat = pasangFetch([{ ms: 5, gagal: true }]);
    let err = null;
    try { await fetchAntiMacet('u', {}, null, 'uji', STALL); } catch (e) { err = e; }
    t(err !== null && catat.length === STALL_MAX, `semua ${STALL_MAX} koneksi gagal → melempar error`);
  }

  {
    const catat = pasangFetch([{ ms: 5000 }]);
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 20);
    let err = null;
    try { await fetchAntiMacet('u', {}, ctrl.signal, 'uji', STALL); } catch (e) { err = e; }
    t(err !== null && catat.every(c => c.dibatalkan), 'klien putus → SEMUA koneksi dibatalkan, tidak ada yang menggantung');
  }

  {
    const ctrl = new AbortController();
    ctrl.abort();
    pasangFetch([{ ms: 5 }]);
    let err = null;
    try { await fetchAntiMacet('u', {}, ctrl.signal, 'uji', STALL); } catch (e) { err = e; }
    t(err !== null && /Dibatalkan sebelum/.test(err.message), 'sudah dibatalkan sebelum mulai → tidak menembak upstream');
  }

  {
    const catat = pasangFetch([{ ms: STALL * 1.7, status: 429 }, { ms: STALL * 1.2 }, { ms: 5000 }]);
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    t(res.ke === 1 && res.status === 200, '429 dari koneksi lama TIDAK membatalkan cadangan yang masih jalan → cadangan menang');
    t(catat[2].dibatalkan === true, 'koneksi ketiga yang masih menggantung dibatalkan setelah cadangan menang');
  }

  {
    const catat = pasangFetch([{ ms: 5, status: 429 }]);
    const mulai = Date.now();
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    t(res.status === 429 && catat.length === 1 && Date.now() - mulai < STALL, '429 cepat tanpa koneksi lain → langsung diteruskan (model cadangan), tanpa menembak ulang');
  }

  {
    const catat = pasangFetch([{ ms: STALL + 10, status: 429 }, { ms: 5000 }]);
    const mulai = Date.now();
    const res = await fetchAntiMacet('u', {}, null, 'uji', STALL);
    const lama = Date.now() - mulai;
    t(res.status === 429 && lama < STALL * 3 && catat[1].dibatalkan === true, '429 + cadangan menggantung → 429 diteruskan setelah satu ambang, cadangan dibatalkan');
  }

  global.fetch = fetchAsli;
  console.warn = warnAsli;
  return done();
};
