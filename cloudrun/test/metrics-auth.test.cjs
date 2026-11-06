const http = require('node:http');
const express = require('express');
const { suite } = require('./helpers.cjs');

function ambil(port, token) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: '/metrics', headers: token ? { Authorization: `Bearer ${token}` } : {} }, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    }).on('error', reject);
  });
}

module.exports = async () => {
  const { t, done } = suite('/metrics: tanpa token hanya status, uptime & model');
  const lama = process.env.METRICS_TOKEN;
  process.env.METRICS_TOKEN = 'rahasia-uji-panjang-123';
  delete require.cache[require.resolve('../server/observability')];
  const { registerMetrics } = require('../server/observability');
  const app = express();
  registerMetrics(app);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const anon = await ambil(port);
    t(anon.status === 200 && anon.body.status === 'ok' && typeof anon.body.uptime_detik === 'number' && anon.body.config, 'anonim tetap dapat status, uptime & config (cek deploy di runbook tetap jalan)');
    t(!('biaya' in anon.body) && !('trafik' in anon.body) && !('kualitas' in anon.body) && !('latensi_ms' in anon.body), 'anonim TIDAK melihat biaya, trafik, latensi & error');
    const salah = await ambil(port, 'tebakan');
    t(!('biaya' in salah.body), 'token salah diperlakukan seperti anonim');
    const benar = await ambil(port, 'rahasia-uji-panjang-123');
    t('biaya' in benar.body && 'trafik' in benar.body && 'kualitas' in benar.body, 'token operator yang benar melihat angka lengkap');
  } finally {
    server.close();
    if (lama === undefined) delete process.env.METRICS_TOKEN; else process.env.METRICS_TOKEN = lama;
    delete require.cache[require.resolve('../server/observability')];
  }
  return done();
};
