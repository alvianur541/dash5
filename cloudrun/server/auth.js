const { ALLOWED_ORIGINS, AUTH_CACHE_TTL_MS, RATE_LIMIT_PER_MIN, SUPABASE_ANON_KEY, SUPABASE_URL } = require('./config');

const _rateBuckets = new Map();

function rateLimit(req, res, next) {
  const key = (req.authUser && req.authUser.id) || req.ip || 'anon';
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

function securityHeaders(app) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}


async function verifyToken(req, res, next) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Auth misconfigured: SUPABASE_URL/SUPABASE_ANON_KEY missing — rejecting request');
    return res.status(503).json({ error: 'Auth service misconfigured' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length > 4096) {
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

const _userCache = new Map();

async function fetchAuthUser(token) {
  const hit = _userCache.get(token);
  if (hit && Date.now() < hit.expiresAt) return hit.user;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) { _userCache.delete(token); return null; }
  const user = await r.json();
  if (_userCache.size >= 200) _userCache.delete(_userCache.keys().next().value);
  _userCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  return user;
}

module.exports = { rateLimit, securityHeaders, verifyToken };
