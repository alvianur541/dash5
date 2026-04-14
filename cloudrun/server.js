/**
 * Dash⁵ — Vertex AI Auth Proxy
 * Deployed on Cloud Run (has built-in service account credentials).
 * Receives requests from the browser, adds Google OAuth token, forwards to Vertex AI.
 */

const express = require('express');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(express.json({ limit: '20mb' }));

const PROJECT_ID   = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION     = process.env.VERTEX_LOCATION || 'us-central1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

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
// Returns: raw Vertex AI generateContent response
app.post('/v1/chat', async (req, res) => {
  if (!PROJECT_ID) {
    return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT env var not set' });
  }

  const { model = 'gemini-2.0-flash-001', ...body } = req.body;

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Dash⁵ Vertex proxy listening on :${PORT}`));
