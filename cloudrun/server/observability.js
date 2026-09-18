const { CACHE_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL, USAGE_LOG_ON } = require('./config');

const _stat = { mulai: Date.now(), req: [], err: [] };

const JENDELA_MS = 15 * 60 * 1000;

function catatStat(arr, entri) {
  const batas = Date.now() - JENDELA_MS;
  arr.push(entri);
  while (arr.length && arr[0].t < batas) arr.shift();
  if (arr.length > 2000) arr.splice(0, arr.length - 2000);
}

function persentil(v, p) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}


function registerMetrics(app) {
  app.get('/metrics', (_req, res) => {
    const batas = Date.now() - JENDELA_MS;
    const r = _stat.req.filter(x => x.t >= batas);
    const e = _stat.err.filter(x => x.t >= batas);
    const ttft = r.map(x => x.ttft).filter(Boolean);
    const total = r.map(x => x.total);
    const perUnit = {};
    const perRoute = {};
    let biaya = 0, tokenIn = 0, tokenOut = 0, fallback = 0, degraded = 0;
    const sebabFallback = {};
    for (const x of r) {
      perUnit[x.unit] = (perUnit[x.unit] || 0) + 1;
      perRoute[x.route] = (perRoute[x.route] || 0) + 1;
      biaya += x.cost; tokenIn += x.in; tokenOut += x.out;
      if (x.fallback) {
        fallback++;
        const s = x.sebabFallback || 'lain';
        sebabFallback[s] = (sebabFallback[s] || 0) + 1;
      }
      if (x.degraded) degraded++;
    }
    const menit = Math.max(1, Math.min(15, (Date.now() - _stat.mulai) / 60000));
    res.json({
      status: 'ok',
      uptime_detik: Math.round((Date.now() - _stat.mulai) / 1000),
      jendela: '15 menit terakhir',
      trafik: {
        request: r.length,
        per_menit: Number((r.length / menit).toFixed(2)),
        per_unit: perUnit,
        per_route: perRoute,
      },
      latensi_ms: {
        ttft_p50: persentil(ttft, 0.5), ttft_p90: persentil(ttft, 0.9), ttft_max: ttft.length ? Math.max(...ttft) : 0,
        total_p50: persentil(total, 0.5), total_p90: persentil(total, 0.9), total_max: total.length ? Math.max(...total) : 0,
      },
      kualitas: {
        fallback_model: fallback,
        fallback_sebab: sebabFallback,
        rerank_degraded: degraded,
        error: e.length,
        error_terakhir: e.slice(-3).map(x => ({ sebab: x.sebab, unit: x.unit, menit_lalu: Math.round((Date.now() - x.t) / 60000) })),
      },
      biaya: {
        token_in: tokenIn, token_out: tokenOut,
        usd: Number(biaya.toFixed(4)),
        idr: Math.round(biaya * 16300),
      },
      config: {
        model: process.env.VERTEX_MODEL || '-',
        fallback: process.env.FALLBACK_MODELS || '-',
        prompt_cache: CACHE_ENABLED ? 'on' : 'off',
        usage_log: USAGE_LOG_ON ? 'on' : 'off',
      },
    });
  });
}


function ringkasTanya(teks, jumlahGambar) {
  const bersih = (teks || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const tag = jumlahGambar > 0 ? '[+foto] ' : '';
  return tag + (bersih || '(tanpa teks)');
}

let kolomBaruGagal = 0;
const COBA_LAGI_MS = 10 * 60_000;

function barisPemakaian(req, d, pakaiKolomBaru) {
  const dasar = {
    user_name: d.userName,
    user_nik: (req.authUser && req.authUser.email || '').split('@')[0] || null,
    session_id: d.sessionId,
    model: d.unit,
    input_tokens: d.usage.input,
    output_tokens: d.usage.output + d.usage.thinking,
    llm_calls: d.usage.calls,
    tools_used: [d.meta.route, d.meta.confidence, d.meta.modelUsed].filter(Boolean),
    cost_usd: Number(d.biaya.toFixed(6)),
    cost_idr: Math.round(d.biaya * 16300),
  };
  if (!pakaiKolomBaru) return dasar;
  return {
    ...dasar,
    ttft_ms: d.ttft || null,
    total_ms: d.totalMs || null,
    route: d.meta.route || null,
    model_ai: d.meta.modelUsed || null,
    confidence: d.meta.confidence || null,
    fallback_to: d.meta.fallbackTo || null,
    fallback_sebab: d.meta.fallbackSebab || null,
    degraded: d.meta.degraded === true,
    request_id: d.requestId || null,
  };
}

async function kirimPemakaian(req, d, pakaiKolomBaru) {
  return fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/usage_logs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${req.authToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(barisPemakaian(req, d, pakaiKolomBaru)),
    signal: AbortSignal.timeout(5_000),
  });
}

async function catatPemakaian(req, d) {
  if (!USAGE_LOG_ON || !SUPABASE_URL || !SUPABASE_ANON_KEY || !req.authToken) return;
  try {
    // Deployed before the migration: PostgREST rejects unknown columns with 400 — fall back, never drop the row.
    const kolomBaru = Date.now() - kolomBaruGagal > COBA_LAGI_MS;
    let r = await kirimPemakaian(req, d, kolomBaru);
    if (!r.ok && r.status === 400 && kolomBaru) {
      const teks = await r.text().catch(() => '');
      if (/column|PGRST204/i.test(teks)) {
        kolomBaruGagal = Date.now();
        console.warn('[usage-log] kolom latensi belum ada di DB — jalankan migration 20260918; pakai kolom lama, coba lagi 10 mnt');
        r = await kirimPemakaian(req, d, false);
      } else {
        console.warn('[usage-log] tolak rid=%s HTTP 400: %s', d.requestId, teks.slice(0, 200));
        return;
      }
    }
    if (!r.ok) {
      const teks = await r.text().catch(() => '');
      console.warn('[usage-log] tolak rid=%s HTTP %d: %s', d.requestId, r.status, teks.slice(0, 200));
    }
  } catch (err) {
    console.warn('[usage-log] gagal simpan rid=%s: %s', d.requestId, err && err.message);
  }
}

module.exports = { JENDELA_MS, _stat, catatPemakaian, catatStat, persentil, registerMetrics, ringkasTanya };
