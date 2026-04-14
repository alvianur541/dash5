/**
 * Dash⁵ — Vertex AI Auth Proxy
 * Deployed on Cloud Run (has built-in service account credentials).
 * Receives requests from the browser, adds Google OAuth token, forwards to Vertex AI.
 */

const express = require('express');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(express.json({ limit: '20mb' }));

const PROJECT_ID     = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION       = process.env.VERTEX_LOCATION || 'us-central1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY;   // Vertex AI Express key untuk Gemini 3
const COHERE_API_KEY = process.env.COHERE_API_KEY;

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow configured origin or all if set to '*'
  if (ALLOWED_ORIGIN === '*' || origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Auth client (uses Cloud Run's built-in service account) ──────────────────
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Proxy: POST /v1/chat ──────────────────────────────────────────────────────
// Body: { model, contents, systemInstruction?, tools?, generationConfig? }
// Gemini 3 → Vertex AI Express (API key), Gemini 2.x → Vertex AI (OAuth)
app.post('/v1/chat', async (req, res) => {
  const { model = 'gemini-2.5-flash', enableGoogleSearch = false, ...body } = req.body;

  // Inject Google Search Grounding tool jika RAG tidak menemukan hasil
  if (enableGoogleSearch) {
    body.tools = [...(body.tools || []), { googleSearch: {} }];
  }

  // ── Route: Gemini 3 → Vertex AI Express (API key) ─────────────────────────
  if (model.startsWith('gemini-3') && VERTEX_API_KEY) {
    const projectId = PROJECT_ID || 'vertex-490600';
    const url =
      `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}` +
      `/locations/global/publishers/google/models/${model}:generateContent` +
      `?key=${VERTEX_API_KEY}`;
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        console.error('Vertex AI Express error:', JSON.stringify(data));
        return res.status(upstream.status).json(data);
      }
      return res.json(data);
    } catch (err) {
      console.error('Vertex AI Express proxy error:', err);
      return res.status(500).json({ error: String(err) });
    }
  }

  // ── Route: Gemini 2.x → Vertex AI (OAuth) ────────────────────────────────
  if (!PROJECT_ID) {
    return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT env var not set' });
  }

  const vertexUrl =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

  try {
    const client = await auth.getClient();
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token;

    const upstream = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error('Vertex AI error:', JSON.stringify(data));
      return res.status(upstream.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Proxy: POST /v1/transcribe ────────────────────────────────────────────────
// Body: { audio: base64string, mimeType: string }
// Returns: { text: string }
app.post('/v1/transcribe', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }
  const { audio, mimeType } = req.body;
  if (!audio || !mimeType) {
    return res.status(400).json({ error: 'audio and mimeType are required' });
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: audio } },
              { text: 'Transcribe this audio accurately. Use the same language as spoken. Return only the transcribed text, no explanations or punctuation notes.' },
            ],
          }],
        }),
      }
    );
    if (!upstream.ok) {
      const err = await upstream.json();
      return res.status(upstream.status).json(err);
    }
    const data = await upstream.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    res.json({ text });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Proxy: POST /v1/embed ─────────────────────────────────────────────────────
// Body: { query: string }
// Returns: { values: number[] }
app.post('/v1/embed', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }
  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: query }] },
        }),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json(data);
    res.json({ values: data?.embedding?.values ?? [] });
  } catch (err) {
    console.error('Embed error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Proxy: POST /v1/rerank ────────────────────────────────────────────────────
// Body: { query: string, documents: string[], topN: number }
// Returns: raw Cohere rerank response
app.post('/v1/rerank', async (req, res) => {
  if (!COHERE_API_KEY) {
    return res.status(500).json({ error: 'COHERE_API_KEY not configured' });
  }
  const { query, documents, topN = 3 } = req.body;
  if (!query || !documents) {
    return res.status(400).json({ error: 'query and documents are required' });
  }

  try {
    const upstream = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COHERE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'rerank-v4.0-pro',
        query,
        documents,
        top_n: topN,
      }),
    });
    if (!upstream.ok) {
      const err = await upstream.json();
      return res.status(upstream.status).json(err);
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('Rerank error:', err);
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Dash⁵ Vertex proxy listening on :${PORT}`));
