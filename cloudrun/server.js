const express = require('express');

const { setGlobalDispatcher, Agent } = require('undici');

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 10_000,
  connect: { timeout: 10_000 },
}));

const orch = require('./dist/orchestrator.cjs');
const { rateLimit, securityHeaders, verifyToken } = require('./server/auth');
const { ALLOWED_MODELS, BASE64_RE, HISTORY_MAX_CHARS, HISTORY_MAX_MSG, IMAGE_MAX_BYTES, IMAGE_MIME_ALLOWED, REQUEST_DEADLINE_MS, SUPABASE_ANON_KEY, SUPABASE_URL, UPSTREAM_TIMEOUT_MS, imageMagicMatches } = require('./server/config');
const { _stat, catatPemakaian, catatStat, registerMetrics, ringkasTanya } = require('./server/observability');
const { ASK_MODELS, CACHE_WARM_INTERVAL_MS, cacheFor, cacheInvalidate, warmPromptCaches } = require('./server/promptcache');
const { cohereRerank, embedQuery, getAccessToken, vertexFetch } = require('./server/upstream');
const registerTranscribe = require('./server/transcribe');

const app = express();

const BIG_BODY_PATHS = new Set(['/v1/transcribe', '/v1/ask']);

const smallJson = express.json({ limit: '1mb' });

const bigJson   = express.json({ limit: '20mb' });

app.use((req, res, next) => (BIG_BODY_PATHS.has(req.path) ? next() : smallJson(req, res, next)));

securityHeaders(app);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

registerMetrics(app);

registerTranscribe(app, { verifyToken, rateLimit, bigJson });

const { PostgrestClient } = require('@supabase/postgrest-js');

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
    let reason = '', message = '';
    try { const e = JSON.parse(errText).error; reason = e.status || ''; message = e.message || ''; } catch { }
    console.error('[upstream] %s HTTP %d %s: %s', model, upstream.status, reason, (message || errText).slice(0, 160).replace(/\s+/g, ' '));
    const cacheExpired = upstream.status === 400 && /cache content .* (expired|not found)/i.test(message);
    if (cacheExpired && body.cachedContent) cacheInvalidate(body.cachedContent);
    onChunk({ error: `Upstream ${upstream.status} ${reason}`.trim(), code: upstream.status, cacheExpired });
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

  const userName = (typeof b.userName === 'string' ? b.userName.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40) : '') || 'Teknisi';
  const history  = (Array.isArray(b.history) ? b.history.slice(-HISTORY_MAX_MSG) : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, HISTORY_MAX_CHARS) }));
  const think    = ['low', 'medium', 'high'].includes(b.think) ? b.think : null;
  const rawImages = Array.isArray(b.attachments) ? b.attachments.slice(0, 1) : [];
  const images = [];
  for (const a of rawImages) {
    if (!a || typeof a.mimeType !== 'string' || typeof a.data !== 'string') continue;
    const mime = a.mimeType.split(';')[0].trim().toLowerCase();
    if (!IMAGE_MIME_ALLOWED.has(mime)) return res.status(415).json({ error: `Format gambar tidak didukung: ${mime}` });
    if (!BASE64_RE.test(a.data)) return res.status(400).json({ error: 'Data gambar bukan base64' });
    const decodedBytes = Math.floor(a.data.replace(/\s/g, '').length * 3 / 4);
    if (decodedBytes > IMAGE_MAX_BYTES) return res.status(413).json({ error: `Gambar terlalu besar (${Math.round(decodedBytes / 1048576)} MB, maks ${IMAGE_MAX_BYTES / 1048576} MB)` });
    if (!imageMagicMatches(mime, a.data)) return res.status(415).json({ error: 'Isi gambar tidak cocok dengan formatnya' });
    images.push({ mimeType: mime, data: a.data });
  }

  const userInput = typeof b.userInput === 'string' ? b.userInput : '';
  if (!userInput.trim() && images.length === 0) {
    return res.status(400).json({ error: 'userInput atau attachments wajib diisi' });
  }
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const debug = b.debug === true;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });
  const deadlineAt = Date.now() + REQUEST_DEADLINE_MS;
  let deadlineHit = false;
  const deadlineTimer = setTimeout(() => { deadlineHit = true; ctrl.abort(); }, REQUEST_DEADLINE_MS);

  const supabase = new PostgrestClient(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${req.authToken}` },
  });

  const deps = {
    supabase,
    thinkOverride: think,
    usage: orch.newUsage(),
    meta: {},
    deadlineAt,
    embed: (text) => embedQuery(text, 'RETRIEVAL_QUERY'),
    rerank: async (query, documents, topN) => {
      try {
        const data = await cohereRerank(query, documents, topN);
        return { results: (data.results || []).map(r => ({ index: r.index, score: r.relevance_score })) };
      } catch (err) {
        return { results: [], error: err.message || 'Rerank gagal' };
      }
    },
    cacheFor,
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
    const totalMs = Date.now() - tMulai;
    const m = deps.meta;
    const biaya = deps.usage.input / 1e6 * 0.30 + (deps.usage.output + deps.usage.thinking) / 1e6 * 2.50;
    console.info(
      '[ask] rid=%s user=%s unit=%s q="%s" route=%s conf=%s model=%s ' +
      'ttft=%d rag=%d rerank=%d total=%d in=%d out=%d calls=%d cost=%s%s%s',
      requestId, userName, unit, ringkasTanya(userInput, images.length),
      m.route || '-', m.confidence || '-', m.modelUsed || orch.MODEL,
      ttft, m.msRag || 0, m.msRerank || 0, totalMs,
      deps.usage.input, deps.usage.output + deps.usage.thinking, deps.usage.calls,
      biaya.toFixed(5),
      m.degraded ? ' degraded=1' : '',
      m.fallbackTo ? ` fallback=${m.fallbackTo}${m.fallbackSebab ? `(${m.fallbackSebab})` : ''}` : '');
    catatPemakaian(req, {
      requestId, userName, unit, usage: deps.usage, meta: m,
      ttft, totalMs, biaya, sessionId: typeof b.sessionId === 'string' ? b.sessionId : null,
    });
    catatStat(_stat.req, {
      t: Date.now(), ttft, total: totalMs, unit, route: m.route || '-',
      in: deps.usage.input, out: deps.usage.output + deps.usage.thinking,
      cost: biaya, fallback: !!m.fallbackTo, sebabFallback: m.fallbackSebab || null, degraded: m.degraded === true,
    });
    sseWrite(res, 'meta', {
      usage: deps.usage,
      model: deps.meta.modelUsed || orch.MODEL,
      cacheable: deps.meta.cacheable === true,
      full: answer,
      ...(debug ? { debug: { rid: requestId, route: deps.meta.route, label: deps.meta.label, confidence: deps.meta.confidence, degraded: deps.meta.degraded === true, chunks: deps.meta.chunks || [] } } : {}),
    });
  } catch (err) {
    const kuota = err && err.message === 'KUOTA_PENUH';
    console.error('[ask-error] rid=%s user=%s unit=%s q="%s" after=%dms sebab=%s | %s',
      requestId, userName, unit, ringkasTanya(userInput, images.length), Date.now() - tMulai,
      deadlineHit ? 'deadline' : kuota ? 'kuota-penuh' : 'exception',
      (err && err.stack) || err);
    catatStat(_stat.err, {
      t: Date.now(), unit,
      sebab: deadlineHit ? 'deadline' : kuota ? 'kuota-penuh' : 'exception',
    });
    sseWrite(res, 'error', { message: kuota ? 'KUOTA_PENUH' : deadlineHit ? 'Waktu proses habis — coba kirim ulang pertanyaanmu.' : 'Gagal memproses pertanyaan.' });
  } finally {
    clearTimeout(deadlineTimer);
    if (!res.writableEnded) { sseWrite(res, 'done', {}); res.end(); }
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.info('[boot] Dash5 proxy siap di port %d', PORT);
    getAccessToken()
      .then(() => console.info('[boot] kredensial GCP siap'))
      .then(() => warmPromptCaches('boot'))
      .catch(e => console.warn('[boot] warm-up gagal:', e && e.message));
    setInterval(() => warmPromptCaches('refresh').catch(() => {}), CACHE_WARM_INTERVAL_MS).unref();
  });
}

module.exports = { imageMagicMatches, IMAGE_MIME_ALLOWED, IMAGE_MAX_BYTES, REQUEST_DEADLINE_MS };
