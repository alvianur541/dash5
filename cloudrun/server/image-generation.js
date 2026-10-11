const { randomUUID } = require('node:crypto');
const { PostgrestClient } = require('@supabase/postgrest-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./config');

const IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const DISCLAIMER = 'Ilustrasi konseptual — bukan wiring diagram resmi';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOwnedSession(req, id) {
  const client = new PostgrestClient(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${req.authToken}` },
  });
  const { data, error } = await client.from('chat_sessions').select('user_id,model,messages')
    .eq('id', id).eq('user_id', req.authUser.id).is('deleted_at', null)
    .abortSignal(req.imageSignal).maybeSingle();
  if (error) throw new Error('SESSION_UNAVAILABLE');
  return data;
}

function registerImageGeneration(app, options) {
  const { verifyToken, enabled = process.env.IMAGE_GENERATION_ENABLED === 'true',
    loadSession = loadOwnedSession, generate = require('./image-service').generateIllustration,
    log = entry => console.info('[image-generation] %s', JSON.stringify(entry)) } = options;
  const buckets = new Map();
  let inFlight = 0;
  app.post('/v1/images', verifyToken, async (req, res) => {
    if (!enabled) return res.status(503).json({ error: 'Fitur ilustrasi belum diaktifkan.' });
    const b = req.body || {};
    if (!UUID_RE.test(b.sessionId || '') || typeof b.messageId !== 'string' || !b.messageId || b.messageId.length > 100
      || Object.keys(b).some(key => !['sessionId', 'messageId'].includes(key))) {
      return res.status(400).json({ error: 'Pilih jawaban dari percakapan tersimpan.' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 65_000);
    req.imageSignal = ctrl.signal;
    const onClose = () => { if (!res.writableFinished) ctrl.abort(); };
    res.on('close', onClose);
    const started = Date.now();
    const requestId = randomUUID();
    res.setHeader('Cache-Control', 'no-store');
    let reserved;
    try {
      const session = await loadSession(req, b.sessionId);
      if (!session || session.user_id !== req.authUser.id) return res.status(404).json({ error: 'Percakapan tidak tersedia.' });
      const messages = Array.isArray(session.messages) ? session.messages : [];
      const index = messages.findIndex(m => m && m.id === b.messageId && m.role === 'assistant');
      const answer = index >= 0 ? messages[index].content : null;
      if (typeof answer !== 'string' || !answer.trim()) return res.status(409).json({ error: 'Jawaban belum tersimpan. Tunggu sebentar lalu coba lagi.' });
      const question = messages.slice(0, index).reverse().find(m => m && m.role === 'user')?.content || '';
      const now = Date.now();
      for (const [key, bucket] of buckets) if (now >= bucket.reset && !bucket.busy) buckets.delete(key);
      const bucket = buckets.get(req.authUser.id) || { count: 0, reset: now + 600_000, busy: false };
      if (bucket.busy || bucket.count >= 2 || inFlight >= 4 || buckets.size >= 2000) {
        res.setHeader('Retry-After', '600');
        return res.status(429).json({ error: 'Batas ilustrasi: 2 kali per 10 menit. Tunggu sebelum mencoba lagi.' });
      }
      bucket.count++; bucket.busy = true; inFlight++; reserved = bucket;
      buckets.set(req.authUser.id, bucket);
      const image = await generate({ answer, question, unit: session.model }, { signal: ctrl.signal });
      log({ requestId, route: 'image_generation', model: IMAGE_MODEL, userId: req.authUser.id,
        totalMs: Date.now() - started, imageCount: image.imageCount, imageBytes: Buffer.from(image.data, 'base64').length,
        usage: image.usage, cost: null });
      return res.json({ mimeType: image.mimeType, data: image.data, disclaimer: DISCLAIMER });
    } catch (err) {
      log({ requestId, route: 'image_generation', model: IMAGE_MODEL, totalMs: Date.now() - started,
        status: ctrl.signal.aborted ? 'timeout_or_cancel' : 'failed', code: err.code || 'UNAVAILABLE', cost: null });
      if (res.destroyed) return;
      return res.status(err.status || (ctrl.signal.aborted ? 504 : 502)).json({ error: err.publicMessage || 'Ilustrasi gagal dibuat. Coba lagi nanti; chat tetap bisa digunakan.' });
    } finally {
      if (reserved) { reserved.busy = false; inFlight--; }
      clearTimeout(timer); res.off('close', onClose);
    }
  });
}

module.exports = { registerImageGeneration, loadOwnedSession, IMAGE_MODEL, DISCLAIMER };
