/**
 * Dash⁵ API Proxy Server
 * Keeps ANTHROPIC_API_KEY and GEMINI_API_KEY server-side.
 * Run: node proxy/server.js
 */

import http from 'http';

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY     = process.env.GEMINI_API_KEY;
const PORT           = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dash5.my.id';

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST')    { res.writeHead(405); res.end(); return; }

  const body = await readBody(req);

  try {

    // ── /api/anthropic/v1/messages → Anthropic API ───────────────────────────
    if (req.url === '/api/anthropic/v1/messages') {
      if (!ANTHROPIC_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }));
        return;
      }

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':          ANTHROPIC_KEY,
          'anthropic-version':  '2023-06-01',
          'content-type':       'application/json',
        },
        body,
      });

      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(await upstream.text());
      return;
    }

    // ── /api/embed → Gemini Embedding ────────────────────────────────────────
    if (req.url === '/api/embed') {
      if (!GEMINI_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured on server' }));
        return;
      }

      const { query } = JSON.parse(body);

      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
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
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      // Normalize: always return { values: [...] }
      res.end(JSON.stringify({ values: data?.embedding?.values ?? [] }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');

  } catch (err) {
    console.error('[proxy error]', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream request failed', detail: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Dash⁵ proxy ready on :${PORT}  (origin: ${ALLOWED_ORIGIN})`);
});
