// Semantic cache — pertanyaan yang BERMAKNA SAMA (bukan cuma string identik) dilayani
// dari cache. Lapisan DI ATAS exact-cache di ai.ts, bukan penggantinya.
//
// 🚨 PAGAR KESELAMATAN: query ber-ANGKA di-EXCLUDE total. Embedding "fault code 11006-2"
// dan "11006-3" nyaris identik, tapi jawabannya beda unit/parts — kalau tertukar = fatal.
// Sama untuk PN (4616545 vs 4616544) & interval service (500 vs 2000 jam).
//
// Penyimpanan: embedding 3072-dim dikuantisasi ke int8 (normalisasi → ×127 → base64)
// ≈4KB/entri; mentah ~55KB akan menjebol localStorage. Error kuantisasi ~0.4%,
// jauh di bawah margin ambang 0.93.

import { SEMANTIC_CACHE_PREFIX as PREFIX } from './cacheGen';

const MAX_ITEMS = 20;
const TTL_MS   = 3 * 24 * 60 * 60 * 1000;
/** Ambang cosine — konservatif. Parafrase asli biasanya 0.95+; beda komponen jatuh <0.90. */
const THRESHOLD = 0.93;

/** Query dgn ≥2 digit berurutan = identitasnya ditentukan angka → HARAM dicocokkan semantik. */
const HAS_CODE_RE = /\d{2,}/;

interface SemEntry { q: string; v: string; text: string; exp: number }

const key = (model: string, userName: string) => `${PREFIX}${model}::${userName.toLowerCase()}`;

/** Vector float → unit-normalized int8 → base64. */
function quantize(vec: number[]): string {
  let norm = 0;
  for (const x of vec) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const bytes = new Uint8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round((vec[i] / norm) * 127)));
    bytes[i] = q & 0xff;                     // simpan two's complement dalam byte
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

function dequantize(b64: string): Int8Array | null {
  try {
    const bin = atob(b64);
    const out = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      const b = bin.charCodeAt(i);
      out[i] = b > 127 ? b - 256 : b;
    }
    return out;
  } catch { return null; }
}

/** Cosine similarity — vektor sudah unit-normalized saat quantize, jadi cukup dot product. */
function cosineInt8(a: Int8Array, b: Int8Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 0 ? dot / den : 0;
}

function readAll(model: string, userName: string): SemEntry[] {
  try {
    const raw = localStorage.getItem(key(model, userName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((e): e is SemEntry =>
      e && typeof e.v === 'string' && typeof e.text === 'string' && typeof e.exp === 'number' && e.exp > now);
  } catch { return []; }
}

/** Query layak dicocokkan semantik? (pagar utama — dipakai caller & internal) */
export function isSemanticEligible(query: string): boolean {
  const q = query.trim();
  return q.length >= 6 && q.length <= 300 && !HAS_CODE_RE.test(q);
}

/** Ada entri tersimpan? Dipakai caller untuk SKIP embed call saat cache masih kosong. */
export function hasSemanticEntries(model: string, userName: string): boolean {
  return readAll(model, userName).length > 0;
}

/** Cari jawaban dgn makna terdekat. Return null kalau di bawah ambang. */
export function readSemanticCache(
  model: string, userName: string, query: string, embedding: number[],
): { text: string; score: number; matchedQuery: string } | null {
  if (!isSemanticEligible(query)) return null;
  const entries = readAll(model, userName);
  if (entries.length === 0) return null;

  const probe = dequantize(quantize(embedding));
  if (!probe) return null;

  let best: { text: string; score: number; matchedQuery: string } | null = null;
  for (const e of entries) {
    if (HAS_CODE_RE.test(e.q)) continue;      // lapis kedua: entri ber-angka tak pernah dicocokkan
    const v = dequantize(e.v);
    if (!v) continue;
    const score = cosineInt8(probe, v);
    if (score >= THRESHOLD && (!best || score > best.score)) {
      best = { text: e.text, score, matchedQuery: e.q };
    }
  }
  return best;
}

export function writeSemanticCache(
  model: string, userName: string, query: string, embedding: number[], text: string,
): void {
  if (!isSemanticEligible(query)) return;
  if (text.length < 40 || text.length > 20000) return;   // jangan cache jawaban sampah/kepanjangan
  try {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const entries = readAll(model, userName).filter(e => e.q !== q);
    const updated: SemEntry[] = [
      { q, v: quantize(embedding), text, exp: Date.now() + TTL_MS },
      ...entries,
    ].slice(0, MAX_ITEMS);
    localStorage.setItem(key(model, userName), JSON.stringify(updated));
  } catch {
    // Quota penuh / localStorage disabled → cache opsional, abaikan.
    try { localStorage.removeItem(key(model, userName)); } catch { /* menyerah diam-diam */ }
  }
}
