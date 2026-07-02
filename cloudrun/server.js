const express = require('express');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(express.json({ limit: '20mb' }));

const PROJECT_ID     = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION       = process.env.VERTEX_LOCATION || 'us-central1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dash5.my.id';
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;
const UPSTREAM_TIMEOUT_MS = 60_000;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const COHERE_KEYS = [
  process.env.COHERE_API_KEY,
  process.env.COHERE_API_KEY_2,
  process.env.COHERE_API_KEY_3,
  process.env.COHERE_API_KEY_4,
  process.env.COHERE_API_KEY_5,
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGIN === '*' || origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    const ok = await verifyJWT(authHeader.slice(7));
    if (!ok) return res.status(401).json({ error: 'Invalid or expired token' });
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ error: 'Token verification failed' });
  }
}

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Let google-auth-library handle token caching and refresh internally
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

const _jwtCache = new Map();
async function verifyJWT(token) {
  const hit = _jwtCache.get(token);
  if (hit && Date.now() < hit) return true;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
  });
  if (!r.ok) return false;
  if (_jwtCache.size >= 200) _jwtCache.delete(_jwtCache.keys().next().value);
  _jwtCache.set(token, Date.now() + 5 * 60 * 1000);
  return true;
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/v1/chat', verifyToken, async (req, res) => {
  const { model = 'gemini-2.5-flash', enableGoogleSearch = false, ...body } = req.body;
  if (enableGoogleSearch) body.tools = [...(body.tools || []), { googleSearch: {} }];

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const { url, headers } = await resolveUpstream(model, { stream: false });
    const upstream = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('Vertex AI error:', JSON.stringify(data));
      return res.status(upstream.status).json(data);
    }
    return res.json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Upstream request failed' });
  } finally {
    clearTimeout(timer);
  }
});

app.post('/v1/chat/stream', verifyToken, async (req, res) => {
  const { model = 'gemini-2.5-flash', enableGoogleSearch = false, ...body } = req.body;
  if (enableGoogleSearch) body.tools = [...(body.tools || []), { googleSearch: {} }];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  req.on('close', () => { clearTimeout(timer); ctrl.abort(); });

  try {
    const { url, headers } = await resolveUpstream(model, { stream: true });
    const upstream = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Vertex stream error:', errText);
      res.write(`data: ${JSON.stringify({ error: 'Upstream request failed' })}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) await new Promise(r => res.once('drain', r));
      }
    } finally {
      reader.cancel().catch(() => {});
      res.end();
    }
  } catch (err) {
    console.error('Stream proxy error:', err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      res.end();
    }
  } finally {
    clearTimeout(timer);
  }
});

app.post('/v1/transcribe', verifyToken, async (req, res) => {
  if (!PROJECT_ID) return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT env var not set' });
  const { audio, mimeType } = req.body;
  if (!audio || !mimeType) return res.status(400).json({ error: 'audio and mimeType are required' });

  const cleanMimeType = mimeType.split(';')[0].trim();
  const url =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent`;

  try {
    const gToken = await getAccessToken();
const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gToken}` },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: cleanMimeType, data: audio } },
            { text: 'Transcribe this audio accurately. Use the same language as spoken. Return only the transcribed text, no explanations or punctuation notes.' },
          ],
        }],
        generationConfig: { maxOutputTokens: 1024 },
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
    return res.json({ text });
  } catch (err) {
    console.error('Transcribe error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.post('/v1/embed', verifyToken, async (req, res) => {
  if (!PROJECT_ID) return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT env var not set' });
  const { query, task_type = 'RETRIEVAL_QUERY' } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const url =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${LOCATION}/publishers/google/models/gemini-embedding-001:predict`;

  try {
    const gToken = await getAccessToken();
const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gToken}` },
      body: JSON.stringify({
        instances: [{ content: query, task_type }],
        parameters: { outputDimensionality: 3072 },
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('Vertex embed error:', JSON.stringify(data));
      return res.status(upstream.status).json(data);
    }
    const values = data?.predictions?.[0]?.embeddings?.values ?? [];
    return res.json({ values });
  } catch (err) {
    console.error('Embed error:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.post('/v1/rerank', verifyToken, async (req, res) => {
  if (COHERE_KEYS.length === 0) return res.status(500).json({ error: 'COHERE_API_KEY not configured' });
  const { query, documents, topN = 3 } = req.body;
  if (!query || !documents) return res.status(400).json({ error: 'query and documents are required' });

  for (const key of COHERE_KEYS) {
    try {
      const upstream = await fetch('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'rerank-v4.0-fast', query, documents, top_n: topN }),
      });
      if (upstream.status === 429 || upstream.status === 401 || upstream.status === 403) {
        console.warn('Cohere key gagal (status %d), coba key berikutnya...', upstream.status);
        continue;
      }
      if (!upstream.ok) {
        const err = await upstream.json();
        return res.status(upstream.status).json(err);
      }
      const data = await upstream.json();
      return res.json(data);
    } catch (err) {
      console.warn('Cohere key error, trying next:', err);
    }
  }

  console.error('All Cohere keys rate limited');
  return res.status(429).json({ error: 'Rerank rate limit reached. Coba lagi dalam 1 menit.' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Dash⁵ proxy :${PORT}`));
