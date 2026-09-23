const { CACHE_API, CACHE_ENABLED, CACHE_SAFE_MARGIN_MS, CACHE_TTL_S, CACHE_WAIT_MS, PROJECT_ID } = require('./config');
const { getAccessToken } = require('./upstream');
const orch = require('../dist/orchestrator.cjs');

const { createHash } = require('crypto');

const _promptCache = new Map();

function cacheHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function cacheCreate(model, id, systemText) {
  const token = await getAccessToken();
  const r = await fetch(`${CACHE_API}/projects/${PROJECT_ID}/locations/global/cachedContents`, {
    method: 'POST', headers: cacheHeaders(token),
    body: JSON.stringify({
      model: `projects/${PROJECT_ID}/locations/global/publishers/google/models/${model}`,
      displayName: `dash5:${id}`,
      systemInstruction: { parts: [{ text: systemText }] },
      ttl: `${CACHE_TTL_S}s`,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.name) throw new Error((data.error && data.error.message) || `HTTP ${r.status}`);
  const tokens = data.usageMetadata && data.usageMetadata.totalTokenCount;
  console.info('[prompt-cache] dibuat %s (%d token, ttl %ds)', id, tokens || 0, CACHE_TTL_S);
  return { name: data.name, expiresAt: Date.parse(data.expireTime) || (Date.now() + CACHE_TTL_S * 1000) };
}

async function cacheExtend(name, id) {
  const token = await getAccessToken();
  const r = await fetch(`${CACHE_API}/${name}?updateMask=ttl`, {
    method: 'PATCH', headers: cacheHeaders(token),
    body: JSON.stringify({ ttl: `${CACHE_TTL_S}s` }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.expireTime) throw new Error((data.error && data.error.message) || `HTTP ${r.status}`);
  console.info('[prompt-cache] diperpanjang %s (+%ds)', id, CACHE_TTL_S);
  return { name, expiresAt: Date.parse(data.expireTime) };
}

function cacheInvalidate(name) {
  for (const [id, e] of _promptCache) {
    if (e.name === name) { _promptCache.delete(id); console.warn('[prompt-cache] %s dibuang (expired di Google)', id); return; }
  }
}

async function cacheFor(model, key, systemText, waitMs = CACHE_WAIT_MS) {
  if (!CACHE_ENABLED || !PROJECT_ID) return null;
  const hash = createHash('sha256').update(model + '\n' + systemText).digest('hex').slice(0, 16);
  const id = `${key}:${hash}`;
  const hit = _promptCache.get(id);
  const now = Date.now();
  const fresh = hit && hit.name && now < hit.expiresAt - CACHE_SAFE_MARGIN_MS;
  if (fresh && !hit.inflight) return hit.name;
  const inflightStale = hit && hit.inflight && now - (hit.inflightAt || 0) > 90_000;
  if (hit && hit.inflight && !inflightStale) {
    if (fresh) return hit.name;
    return waitMs > 0 ? Promise.race([hit.inflight, new Promise(r => setTimeout(() => r(null), waitMs))]) : null;
  }
  if (inflightStale) console.warn('[prompt-cache] permintaan %s macet >90 s — dibuat ulang', id);
  const canExtend = hit && hit.name && now < hit.expiresAt - 30_000;
  const inflight = (async () => {
    try {
      const hardStop = new Promise((_, rej) => setTimeout(() => rej(new Error('batas 50 s terlampaui')), 50_000));
      const entry = await Promise.race([
        canExtend
          ? cacheExtend(hit.name, id).catch(async err => { console.warn('[prompt-cache] perpanjang %s gagal (%s) — buat baru', id, err.message); return cacheCreate(model, id, systemText); })
          : cacheCreate(model, id, systemText),
        hardStop,
      ]);
      _promptCache.set(id, entry);
      return entry.name;
    } catch (err) {
      console.warn('[prompt-cache] gagal %s: %s', id, err && err.message);
      _promptCache.set(id, { name: null, expiresAt: now + 120_000 });
      return null;
    }
  })();
  _promptCache.set(id, { name: canExtend ? hit.name : null, expiresAt: hit ? hit.expiresAt : now, inflight, inflightAt: now });
  inflight.finally(() => { const cur = _promptCache.get(id); if (cur) delete cur.inflight; });
  if (canExtend) return hit.name;
  if (waitMs <= 0) return null;
  return Promise.race([inflight, new Promise(r => setTimeout(() => r(null), waitMs))]);
}

const ASK_MODELS = new Set(orch.UNIT_MODELS);

const CACHE_WARM_INTERVAL_MS = Math.max(60_000, Math.floor(CACHE_TTL_S * 1000 / 3));

async function warmPromptCaches(reason) {
  if (!CACHE_ENABLED || !PROJECT_ID) return;
  const t0 = Date.now();
  let pending = [];
  for (const m of orch.MODEL_CHAIN) for (const unit of orch.UNIT_MODELS) pending.push([m, unit]);
  const total = pending.length;
  for (let attempt = 1; attempt <= 3 && pending.length; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, 30_000));
    const failed = [];
    for (let i = 0; i < pending.length; i += 3) {
      const batch = pending.slice(i, i + 3);
      const res = await Promise.all(batch.map(([m, unit]) => cacheFor(m, `main:${unit}`, orch.SYSTEM_PROMPT(unit), 60_000).catch(() => null)));
      res.forEach((name, j) => { if (!name) failed.push(batch[j]); });
    }
    pending = failed;
    console.info('[prompt-cache] warm-up %s#%d: %d/%d cache siap (%s) (%dms)', reason, attempt, total - pending.length, total, orch.MODEL_CHAIN.join('→'), Date.now() - t0);
  }
}

module.exports = { ASK_MODELS, CACHE_WARM_INTERVAL_MS, _promptCache, cacheCreate, cacheExtend, cacheFor, cacheHeaders, cacheInvalidate, warmPromptCaches };
