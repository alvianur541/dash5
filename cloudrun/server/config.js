const PROJECT_ID     = process.env.GOOGLE_CLOUD_PROJECT;

const LOCATION       = process.env.VERTEX_LOCATION || 'us-central1';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'https://dash5.my.id')
  .split(',').map(s => s.trim()).filter(s => s && s !== '*');
if (ALLOWED_ORIGINS.length === 0) {
  console.error('ALLOWED_ORIGIN kosong / hanya "*" — CORS ditutup total. Set origin eksplisit.');
}

const VERTEX_API_KEY = process.env.VERTEX_API_KEY;

const UPSTREAM_TIMEOUT_MS = 35_000;

const UPSTREAM_429_BACKOFF_MS = [1_500];

const UPSTREAM_429_RETRIES = UPSTREAM_429_BACKOFF_MS.length;

const REQUEST_DEADLINE_MS = Number(process.env.REQUEST_DEADLINE_MS) || 120_000;

const IMAGE_MAX_BYTES     = 8 * 1024 * 1024;

const IMAGE_MIME_ALLOWED  = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const IMAGE_MAGIC = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/heic': [], 'image/heif': [],
};

function imageMagicMatches(mime, base64) {
  const sigs = IMAGE_MAGIC[mime];
  if (!sigs || sigs.length === 0) return true;
  const head = Buffer.from(base64.slice(0, 16), 'base64');
  return sigs.some(sig => sig.every((byte, i) => head[i] === byte));
}

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

const ALLOWED_MODELS = new Set(
  (process.env.ALLOWED_MODELS || 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.1-flash-lite-preview,gemini-2.5-flash')
    .split(',').map(s => s.trim()).filter(Boolean)
);

const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '150', 10);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const AUTH_CACHE_TTL_MS = parseInt(process.env.AUTH_CACHE_TTL_MS || '60000', 10);

const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'gemini-3.7-flash';

const AUDIO_MAX_BYTES  = 6 * 1024 * 1024;

const AUDIO_MIME_RE    = /^audio\/[a-z0-9.+-]+$/i;

const BASE64_RE        = /^[A-Za-z0-9+/=\s]+$/;

const CACHE_TTL_S      = parseInt(process.env.PROMPT_CACHE_TTL_S || '3600', 10);

const CACHE_ENABLED    = process.env.PROMPT_CACHE !== 'off';

const CACHE_WAIT_MS = 1_500;

const CACHE_SAFE_MARGIN_MS = 5 * 60_000;

const CACHE_API = `https://aiplatform.googleapis.com/v1beta1`;

const HISTORY_MAX_MSG   = 24;

const HISTORY_MAX_CHARS = 4000;

const USAGE_LOG_ON = process.env.USAGE_LOG !== 'off';

module.exports = { ALLOWED_MODELS, ALLOWED_ORIGINS, AUDIO_MAX_BYTES, AUDIO_MIME_RE, AUTH_CACHE_TTL_MS, BASE64_RE, CACHE_API, CACHE_ENABLED, CACHE_SAFE_MARGIN_MS, CACHE_TTL_S, CACHE_WAIT_MS, COHERE_KEYS, COHERE_RERANK_MODEL, GEMINI_API_KEY, HISTORY_MAX_CHARS, HISTORY_MAX_MSG, IMAGE_MAGIC, IMAGE_MAX_BYTES, IMAGE_MIME_ALLOWED, LOCATION, PROJECT_ID, RATE_LIMIT_PER_MIN, REQUEST_DEADLINE_MS, SUPABASE_ANON_KEY, SUPABASE_URL, TRANSCRIBE_MODEL, UPSTREAM_429_BACKOFF_MS, UPSTREAM_429_RETRIES, UPSTREAM_TIMEOUT_MS, USAGE_LOG_ON, VERTEX_API_KEY, imageMagicMatches };
