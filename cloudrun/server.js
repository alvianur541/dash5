const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const { setGlobalDispatcher, Agent } = require('undici');
const orch = require('./dist/orchestrator.cjs');

const UNIT_MODELS = new Set(orch.UNIT_MODELS);

// Idle pooled connections die silently; drop them after 10s.
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 10_000,
  connect: { timeout: 10_000 },
}));

const app = express();

// Global parser MUST skip these, else bigJson never runs and photos 413.
const BIG_BODY_PATHS = new Set(['/v1/transcribe', '/v1/ask']);
const smallJson = express.json({ limit: '1mb' });
const bigJson   = express.json({ limit: '20mb' });
app.use((req, res, next) => (BIG_BODY_PATHS.has(req.path) ? next() : smallJson(req, res, next)));

const PROJECT_ID     = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION       = process.env.VERTEX_LOCATION || 'us-central1';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'https://dash5.my.id')
  .split(',').map(s => s.trim()).filter(s => s && s !== '*');
if (ALLOWED_ORIGINS.length === 0) {
  console.error('ALLOWED_ORIGIN kosong / hanya "*" — CORS ditutup total. Set origin eksplisit.');
}
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;
const UPSTREAM_TIMEOUT_MS = 35_000;
// One retry only: retrying a full quota just deepens it.
const UPSTREAM_429_BACKOFF_MS = [1_500];
const UPSTREAM_429_RETRIES = UPSTREAM_429_BACKOFF_MS.length;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const COHERE_KEYS = [
  process.env.COHERE_API_KEY,
  process.env.COHERE_API_KEY_2,
  process.env.COHERE_API_KEY_3,
  process.env.COHERE_API_KEY_4,
  process.env.COHERE_API_KEY_5,
].filter(Boolean);

const COHERE_RERANK_MODEL = process.env.COHERE_RERANK_MODEL || 'rerank-v4.0-fast';

// Env var replaces this default entirely.
const ALLOWED_MODELS = new Set(
  (process.env.ALLOWED_MODELS || 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.1-flash-lite-preview,gemini-2.5-flash')
    .split(',').map(s => s.trim()).filter(Boolean)
);

const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '150', 10);
const _rateBuckets = new Map();
function rateLimit(req, res, next) {
  const key = (req.authUser && req.authUser.id) || req.headers['authorization'] || req.ip || 'anon';
  const now = Date.now();
  let b = _rateBuckets.get(key);
  if (!b || now >= b.reset) { b = { count: 0, reset: now + 60_000 }; _rateBuckets.set(key, b); }
  b.count++;
  if (_rateBuckets.size > 2000) {
    for (const [k, v] of _rateBuckets) if (now >= v.reset) _rateBuckets.delete(k);
  }
  if (b.count > RATE_LIMIT_PER_MIN) {
    return res.status(429).json({ error: 'Terlalu banyak request. Tunggu sebentar lalu coba lagi.' });
  }
  next();
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function verifyToken(req, res, next) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Auth misconfigured: SUPABASE_URL/SUPABASE_ANON_KEY missing — rejecting request');
    return res.status(503).json({ error: 'Auth service misconfigured' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const user = await fetchAuthUser(authHeader.slice(7));
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid or expired token' });
    req.authUser = user;
    req.authToken = authHeader.slice(7);
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ error: 'Token verification failed' });
  }
}

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

// 20s, NOT 8 — streaming headers arrive only after thinking finishes.
const STALL_MS_NONSTREAM     = 8_000;
const STALL_MS_STREAM_CEPAT  = 10_000;
const STALL_MS_STREAM_MIKIR  = 30_000;
const STALL_MAX = 3;

async function fetchAntiMacet(url, opts, signal, label, stallMs = STALL_MS_NONSTREAM) {
  for (let i = 1; i <= STALL_MAX; i++) {
    if (signal && signal.aborted) throw new Error('Dibatalkan sebelum request');
    const ctrl = new AbortController();
    const teruskan = () => ctrl.abort();
    if (signal) signal.addEventListener('abort', teruskan, { once: true });
    const timer = setTimeout(() => ctrl.abort(), i < STALL_MAX ? stallMs : 60_000);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (err) {
      if (signal && signal.aborted) throw err;
      if (i === STALL_MAX) throw err;
      console.warn('[upstream] %s macet >%d dtk — buka koneksi baru (%d/%d)',
        label, stallMs / 1000, i, STALL_MAX);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', teruskan);
    }
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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

// Same model, two doors: AI Studio first, Vertex as fallback.
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

const AUTH_CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS || '60000', 10);
const _userCache = new Map();

async function fetchAuthUser(token) {
  const hit = _userCache.get(token);
  if (hit && Date.now() < hit.expiresAt) return hit.user;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
  });
  if (!r.ok) { _userCache.delete(token); return null; }
  const user = await r.json();
  if (_userCache.size >= 200) _userCache.delete(_userCache.keys().next().value);
  _userCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  return user;
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'gemini-3.7-flash';

app.post('/v1/transcribe', verifyToken, rateLimit, bigJson, async (req, res) => {
  if (!PROJECT_ID) return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT env var not set' });
  const { audio, mimeType } = req.body;
  if (!audio || !mimeType) return res.status(400).json({ error: 'audio and mimeType are required' });

  const cleanMimeType = mimeType.split(';')[0].trim();
  const t0 = Date.now();

  try {
    // Plain fetch, not vertexFetch — its 8s stall guard would kill long recordings.
    const { url, headers } = await resolveUpstream(TRANSCRIBE_MODEL, { stream: false });
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: cleanMimeType, data: audio } },
            { text: 'Transcribe this audio accurately. Use the same language as spoken. Return only the transcribed text, no explanations or punctuation notes.' },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 1024,
          // 3.x rejects 'minimal'; 2.5 uses thinkingBudget instead.
          ...(TRANSCRIBE_MODEL.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }),
    });
    if (!upstream.ok) {
      const err = await upstream.json();
      console.error('Transcribe error:', JSON.stringify(err));
      return res.status(upstream.status).json(err);
    }
    const data = await upstream.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
    console.info('[transcribe] model=%s ms=%d chars=%d', TRANSCRIBE_MODEL, Date.now() - t0, text.length);
    return res.json({ text });
  } catch (err) {
    console.error('Transcribe error:', err);
    return res.status(500).json({ error: 'Transcribe gagal. Coba lagi.' });
  }
});

// PostgREST direct: supabase-js needs a global WebSocket, absent in Node 20.
const { PostgrestClient } = require('@supabase/postgrest-js');

const ASK_MODELS = UNIT_MODELS;

function sseWrite(res, event, payload) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ ev: event, ...payload })}\n\n`);
}

async function vertexStreamParsed(model, body, onChunk, signal) {
  const t0 = Date.now();
  let tHeader = 0, tChunk1 = 0;
  const upstream = await vertexFetch(model, body, { stream: true, signal, label: '/v1/ask' });
  tHeader = Date.now() - t0;
  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error('Vertex stream error (/v1/ask):', errText);
    onChunk({ error: 'Upstream request failed', code: upstream.status });
    return;
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!tChunk1) {
        tChunk1 = Date.now() - t0;
        console.info('[vertex-stream] header=%dms chunk1=%dms', tHeader, tChunk1);
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        let json;
        try { json = JSON.parse(jsonStr); } catch { continue; }
        if (json.error) { onChunk({ error: String(json.error.message || json.error), code: json.error.code }); return; }
        const cand = json.candidates && json.candidates[0];
        if (cand && cand.finishReason && cand.finishReason !== 'STOP') {
          console.warn('[vertex-stream] finishReason=%s', cand.finishReason);
        }
        if (json.promptFeedback && json.promptFeedback.blockReason) {
          console.warn('[vertex-stream] blockReason=%s', json.promptFeedback.blockReason);
        }
        const parts = (cand && cand.content && cand.content.parts) || [];
        const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
        onChunk({ text, usageMetadata: json.usageMetadata, live: true, finishReason: cand && cand.finishReason });
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

app.post('/v1/ask', verifyToken, rateLimit, bigJson, async (req, res) => {
  const b = req.body || {};
  const unit = typeof b.model === 'string' ? b.model : '';
  if (!ASK_MODELS.has(unit)) return res.status(400).json({ error: 'Model unit tidak dikenal' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Supabase belum dikonfigurasi' });

  const userName = typeof b.userName === 'string' ? b.userName.slice(0, 80) : 'Teknisi';
  const history  = Array.isArray(b.history) ? b.history.slice(-40) : [];
  const think    = ['low', 'medium', 'high'].includes(b.think) ? b.think : null;
  const images   = Array.isArray(b.attachments)
    ? b.attachments.filter(a => a && typeof a.mimeType === 'string' && typeof a.data === 'string').slice(0, 1)
    : [];

  const userInput = typeof b.userInput === 'string' ? b.userInput : '';
  if (!userInput.trim() && images.length === 0) {
    return res.status(400).json({ error: 'userInput atau attachments wajib diisi' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // res, NOT req — req 'close' fires when the body is read, aborting everything.
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });

  const supabase = new PostgrestClient(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${req.authToken}` },
  });

  const deps = {
    supabase,
    thinkOverride: think,
    usage: orch.newUsage(),
    meta: {},
    embed: (text) => embedQuery(text, 'RETRIEVAL_QUERY'),
    rerank: async (query, documents, topN) => {
      try {
        const data = await cohereRerank(query, documents, topN);
        return { results: (data.results || []).map(r => ({ index: r.index, score: r.relevance_score })) };
      } catch (err) {
        return { results: [], error: err.message || 'Rerank gagal' };
      }
    },
    generate: async (body, model, enableGoogleSearch) => {
      if (!ALLOWED_MODELS.has(model)) throw new Error(`Model tidak diizinkan: ${model}`);
      const payload = { ...body };
      if (enableGoogleSearch) payload.tools = [...(payload.tools || []), { googleSearch: {} }];
      const callCtrl = new AbortController();
      const timer = setTimeout(() => callCtrl.abort(), UPSTREAM_TIMEOUT_MS);
      const signal = AbortSignal.any([callCtrl.signal, ctrl.signal]);
      try {
        const upstream = await vertexFetch(model, payload, { stream: false, signal, label: '/v1/ask' });
        const data = await upstream.json();
        if (!upstream.ok) throw new Error(`Vertex AI error ${upstream.status}: ${JSON.stringify(data)}`);
        return data;
      } finally { clearTimeout(timer); }
    },
    stream: async (body, model, onChunk, opts = {}) => {
      if (!ALLOWED_MODELS.has(model)) throw new Error(`Model tidak diizinkan: ${model}`);
      const payload = { ...body };
      if (opts.enableGoogleSearch) payload.tools = [...(payload.tools || []), { googleSearch: {} }];
      const signal = opts.signal ? AbortSignal.any([opts.signal, ctrl.signal]) : ctrl.signal;
      await vertexStreamParsed(model, payload, onChunk, signal);
    },
  };

  const tMulai = Date.now();
  let ttft = 0;
  const onChunk = (text) => {
    if (!ttft) ttft = Date.now() - tMulai;
    sseWrite(res, 'text', { text });
  };
  const onEvent = (event) => sseWrite(res, 'agent_event', { event });

  try {
    const answer = await orch.runWithDeps(deps, async () => {
      if (images.length > 0) {
        return orch.generateResponse(unit, userName, history, userInput, images, onChunk, onEvent);
      }
      return orch.generateResponseStream(unit, userName, history, userInput, onChunk, onEvent);
    });
    console.info('[ask] ttft=%dms total=%dms in=%d out=%d thinking=%d calls=%d',
      ttft, Date.now() - tMulai, deps.usage.input, deps.usage.output,
      deps.usage.thinking, deps.usage.calls);
    sseWrite(res, 'meta', {
      usage: deps.usage,
      model: orch.MODEL,
      cacheable: deps.meta.cacheable === true,
      full: answer,
    });
  } catch (err) {
    console.error('/v1/ask error:', (err && err.stack) || err);
    sseWrite(res, 'error', { message: err && err.message === 'KUOTA_PENUH' ? 'KUOTA_PENUH' : 'Gagal memproses pertanyaan.' });
  } finally {
    if (!res.writableEnded) { sseWrite(res, 'done', {}); res.end(); }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Dash⁵ proxy :${PORT}`);
  getAccessToken()
    .then(() => console.log('[boot] kredensial GCP siap'))
    .catch(e => console.warn('[boot] warm-up kredensial gagal:', e && e.message));
});
