const { COHERE_KEYS, COHERE_RERANK_MODEL, GEMINI_API_KEY, LOCATION, PROJECT_ID, UPSTREAM_429_BACKOFF_MS, UPSTREAM_429_RETRIES, VERTEX_API_KEY } = require('./config');

const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function resolveUpstream(model, { stream }) {
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const query  = stream ? '?alt=sse' : '';

  if (model.startsWith('gemini-3')) {
    if (!PROJECT_ID) throw new Error('GOOGLE_CLOUD_PROJECT env var not set');
    const base = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}`
               + `/locations/global/publishers/google/models/${model}:${action}${query}`;
    if (VERTEX_API_KEY) {
      const sep = query ? '&' : '?';
      return {
        url: base + sep + `key=${VERTEX_API_KEY}`,
        headers: { 'Content-Type': 'application/json' },
      };
    }
    const token = await getAccessToken();
    return {
      url: base,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    };
  }

  if (!PROJECT_ID) throw new Error('GOOGLE_CLOUD_PROJECT env var not set');
  const token = await getAccessToken();
  return {
    url: `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}`
       + `/locations/${LOCATION}/publishers/google/models/${model}:${action}${query}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
}

const STALL_MS_NONSTREAM     = 8_000;

const STALL_MS_STREAM_CEPAT  = 10_000;

const STALL_MS_STREAM_MIKIR  = 30_000;

const STALL_MAX = 3;

const BATAS_TOTAL_MS = 60_000;

// Hedged: a slow connection is kept alive while a spare races it — the first header wins.
async function fetchAntiMacet(url, opts, signal, label, stallMs = STALL_MS_NONSTREAM) {
  if (signal && signal.aborted) throw new Error('Dibatalkan sebelum request');
  const ctrls = [];
  const timers = [];
  let selesai = false, jalan = 0, dikirim = 0, errTerakhir = null;
  const batalSemua = () => { for (const c of ctrls) c.abort(); };
  if (signal) signal.addEventListener('abort', batalSemua);

  try {
    return await new Promise((resolve, reject) => {
      const tutup = (fn, nilai, menang) => {
        if (selesai) return;
        selesai = true;
        for (const t of timers) clearTimeout(t);
        for (const c of ctrls) if (c !== menang) c.abort();
        fn(nilai);
      };
      const kirim = () => {
        if (selesai || dikirim >= STALL_MAX) return;
        const ke = ++dikirim;
        jalan++;
        const ctrl = new AbortController();
        ctrls.push(ctrl);
        if (ke > 1) console.warn('[upstream] %s macet >%d dtk — kirim koneksi cadangan (%d/%d)',
          label, stallMs / 1000, ke, STALL_MAX);
        fetch(url, { ...opts, signal: ctrl.signal }).then(
          res => tutup(resolve, res, ctrl),
          err => {
            jalan--;
            errTerakhir = err;
            if (signal && signal.aborted) return tutup(reject, err);
            if (jalan === 0) { if (dikirim >= STALL_MAX) tutup(reject, err); else kirim(); }
          },
        );
        if (ke < STALL_MAX) timers.push(setTimeout(kirim, stallMs));
      };
      timers.push(setTimeout(
        () => tutup(reject, errTerakhir || new Error('Upstream tidak menjawab')), BATAS_TOTAL_MS));
      kirim();
    });
  } finally {
    if (signal) signal.removeEventListener('abort', batalSemua);
  }
}

async function vertexFetch(model, body, { stream, signal, label }) {
  const tAuth = Date.now();
  const { url, headers } = await resolveUpstream(model, { stream });
  const msAuth = Date.now() - tAuth;
  const payload = JSON.stringify(body);
  const tFetch = Date.now();
  const lvl = body && body.generationConfig && body.generationConfig.thinkingConfig
    ? body.generationConfig.thinkingConfig.thinkingLevel : undefined;
  const mikirPanjang = lvl === 'medium' || lvl === 'high';
  const stallMs = !stream
    ? STALL_MS_NONSTREAM
    : (mikirPanjang ? STALL_MS_STREAM_MIKIR : STALL_MS_STREAM_CEPAT);
  let upstream = await fetchAntiMacet(url, { method: 'POST', headers, body: payload }, signal, label, stallMs);
  const msFetch = Date.now() - tFetch;
  if (msAuth > 1000 || msFetch > 3000) {
    console.warn('[upstream] LAMBAT %s auth=%dms fetch=%dms status=%d', label, msAuth, msFetch, upstream.status);
  }
  for (let i = 0; upstream.status === 429 && i < UPSTREAM_429_RETRIES; i++) {
    const waitMs = UPSTREAM_429_BACKOFF_MS[i];
    console.warn(`Vertex 429 (${label}) — tunggu ${waitMs}ms lalu coba lagi (${i + 1}/${UPSTREAM_429_RETRIES})`);
    await new Promise(r => setTimeout(r, waitMs));
    if (signal && signal.aborted) break;
    upstream = await fetchAntiMacet(url, { method: 'POST', headers, body: payload }, signal, label, stallMs);
  }
  return upstream;
}

async function geminiEmbed(query, taskType = 'RETRIEVAL_QUERY') {
  const tEmb = Date.now();
  const upstream = await fetchAntiMacet(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: query }] },
        taskType,
        outputDimensionality: 3072,
      }),
    }, undefined, '/v1/embed-gemini');
  const msEmb = Date.now() - tEmb;
  if (msEmb > 3000) console.warn('[upstream] LAMBAT /v1/embed-gemini fetch=%dms', msEmb);
  const data = await upstream.json();
  if (!upstream.ok) {
    const e = new Error('Gemini embed gagal');
    e.status = upstream.status; e.data = data;
    throw e;
  }
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== 3072) throw new Error('Gemini embed: values invalid');
  return values;
}

async function embedQuery(query, taskType = 'RETRIEVAL_QUERY') {
  if (GEMINI_API_KEY) {
    try {
      return await geminiEmbed(query, taskType);
    } catch (err) {
      console.warn('[embed] AI Studio gagal (%s) — fallback Vertex', err?.status ?? err?.message);
    }
  }
  return vertexEmbed(query, taskType);
}

async function vertexEmbed(query, taskType = 'RETRIEVAL_QUERY') {
  if (!PROJECT_ID) throw new Error('GOOGLE_CLOUD_PROJECT env var not set');
  const url =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${LOCATION}/publishers/google/models/gemini-embedding-001:predict`;
  const gToken = await getAccessToken();
  const tEmb = Date.now();
  const upstream = await fetchAntiMacet(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gToken}` },
    body: JSON.stringify({
      instances: [{ content: query, task_type: taskType }],
      parameters: { outputDimensionality: 3072 },
    }),
  }, undefined, '/v1/embed');
  const msEmb = Date.now() - tEmb;
  if (msEmb > 3000) console.warn('[upstream] LAMBAT /v1/embed fetch=%dms', msEmb);
  const data = await upstream.json();
  if (!upstream.ok) {
    console.error('Vertex embed error:', JSON.stringify(data));
    const e = new Error('Embedding gagal');
    e.status = upstream.status; e.data = data;
    throw e;
  }
  return (data && data.predictions && data.predictions[0] &&
          data.predictions[0].embeddings && data.predictions[0].embeddings.values) || [];
}

async function cohereRerank(query, documents, topN) {
  if (COHERE_KEYS.length === 0) { const e = new Error('COHERE_API_KEY not configured'); e.status = 500; throw e; }
  for (const key of COHERE_KEYS) {
    try {
      const upstream = await fetch('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: COHERE_RERANK_MODEL, query, documents, top_n: topN }),
      });
      if (upstream.status === 429 || upstream.status === 401 || upstream.status === 403) {
        console.warn('Cohere key gagal (status %d), coba key berikutnya...', upstream.status);
        continue;
      }
      const data = await upstream.json();
      if (!upstream.ok) { const e = new Error('Rerank gagal'); e.status = upstream.status; e.data = data; throw e; }
      return data;
    } catch (err) {
      if (err.status) throw err;
      console.warn('Cohere key error, trying next:', err);
    }
  }
  console.error('All Cohere keys rate limited');
  const e = new Error('Rerank rate limit reached. Coba lagi dalam 1 menit.');
  e.status = 429;
  throw e;
}

module.exports = { STALL_MAX, STALL_MS_NONSTREAM, STALL_MS_STREAM_CEPAT, STALL_MS_STREAM_MIKIR, auth, cohereRerank, embedQuery, fetchAntiMacet, geminiEmbed, getAccessToken, resolveUpstream, vertexEmbed, vertexFetch };
