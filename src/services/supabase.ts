import { createClient } from '@supabase/supabase-js';
import { Message, UnitModel } from '../types';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const proxyUrl        = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;


export async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  // Hanya kembalikan token kalau user sudah login dengan email (bukan anonymous).
  // Dash5 memaksa login sebelum akses chat, jadi null di sini = user belum login.
  return data.session?.access_token ?? null;
}

interface SearchResult {
  content: string;
  metadata: any;
  similarity: number;
}

export async function saveOrUpdateChatSession(
  id: string,
  userId: string,
  userName: string,
  model: UnitModel,
  title: string,
  messages: Message[]
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('chat_sessions')
    .upsert({
      id,
      user_id: userId,
      user_name: userName,
      model,
      title,
      messages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to save chat session to Supabase:', error.message);
  }
}

export async function fetchUserSessionList(userId: string): Promise<import('../types').SessionMeta[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, model, updated_at, user_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100); // 100 sesi — cukup untuk power user tanpa overload response

  if (error) {
    console.error('Failed to fetch session list:', error.message);
    return null; // null = error jaringan, bukan kosong
  }

  return (data || []).map(row => ({
    id: row.id,
    title: row.title || '(tanpa judul)',
    model: row.model as UnitModel,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function fetchSessionData(sessionId: string, userId: string): Promise<import('../types').ChatSession | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, model, messages')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch session data:', error?.message);
    return null;
  }

  return {
    id: data.id,
    model: data.model as UnitModel,
    messages: data.messages as Message[],
  };
}

export async function deleteChatSession(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').delete().eq('id', id).eq('user_id', userId);
  if (error) console.error('Failed to delete chat session from Supabase:', error.message);
}

export async function deleteAllChatSessions(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').delete().eq('user_id', userId);
  if (error) console.error('Failed to delete all chat sessions from Supabase:', error.message);
}

const VECTOR_SIMILARITY_THRESHOLD = 0.35;
const EMBED_CACHE_TTL = 30 * 60 * 1000; // 30 min

const embeddingCache    = new Map<string, { values: number[]; expiresAt: number }>();
// In-flight map: dedup concurrent identical embed requests.
// Tanpa ini 10 user query "swing motor" bersamaan → 10× embed API call → rate limit.
const embeddingInFlight = new Map<string, Promise<number[]>>();

function setCached(key: string, value: number[]) {
  // Delete first so re-insert lands at end of Map iteration order (true LRU)
  if (embeddingCache.has(key)) embeddingCache.delete(key);
  if (embeddingCache.size >= 200) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest !== undefined) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, { values: value, expiresAt: Date.now() + EMBED_CACHE_TTL });
}

function getCachedLru(key: string): number[] | null {
  const entry = embeddingCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) { embeddingCache.delete(key); return null; }
  // Promote to MRU position: delete + re-insert
  embeddingCache.delete(key);
  embeddingCache.set(key, entry);
  return entry.values;
}

function isFaultCode(query: string): boolean {
  // Matches: 1208, W:1208, W: 1208, CA2769, CA:2769, 11006-2, ENG:00436-04, etc.
  // WAJIB ada digit — tanpa ini "blade","cafe","dead" jadi false positive.
  // Letter-prefix TANPA dash WAJIB ≥4 digit — cegah fuel grade "B50"/"B30"/"B100"
  // (biodiesel) ter-deteksi sebagai fault code. Konsisten dengan FAULT_CODE_PATTERN di ai.ts.
  return /^(?:[A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}(?:-[0-9A-F]{1,4})?)$/i.test(query.trim());
}

// Parts catalog detection — keyword + part number patterns
const PARTS_KEYWORDS_RE = /\b(part\s*number|part\s*no\.?|p\/?n[\s:]+\w|spare\s*part|suku\s*cadang|nomor\s*part|kode\s*part|harga\s*part|katalog\s*part|parts?\s*catalog|cross[-\s]?ref(?:erence)?|kompatibel|compatibility|substitu(?:te|si)|pengganti\s*part)\b/i;

// Common Indonesian price queries — 'harga seal kit', 'harga pump', dst.
// PARTS_KEYWORDS_RE require literal 'part' word, jadi 'harga seal' tidak match.
// Pattern ini cover komponen umum yang sering ditanya harganya.
const HARGA_COMPONENT_RE = /\b(?:harga|price)\s+(?:promo\s+)?(?:seal|kit|pump|valve|motor|cylinder|filter|gasket|bearing|o-?ring|element|hose|sensor|coupling|grease|oil|coolant|breaker|controller|reman|rotor|piston|spring|nozzle|injector|alternator|starter|battery|belt|fan|radiator|shaft)\b/i;

// Part number patterns (Hitachi + KCM):
//   YNM129150-14200    (Yanmar engine: prefix + 5-8 digits + dash + 4-6 digits) — MUST be first
//   YB60000068         (Hitachi body: letter prefix + 6-10 digits)
//   YZ0108060850       (KCM engine Isuzu BB-6BG1T: YZ + 10-12 digits)
//   DCA50000030001     (KCM long-format: 3-letter + 11-12 digits, edge cases)
//   4616545            (pure 7-10 digits — Hitachi body, Isuzu engine ZX200)
//   423-27-21370       (Komatsu-style multi-segment dashes)
//   34820-66720        (KCM 60ZV / Kawasaki body: 5-digit + dash + 5-digit)
// Range \d{6,12} cover Hitachi/Isuzu/Yanmar/KCM PNs tanpa false positive
// jangka pendek (4-5 digit) yang biasa muncul di service interval atau spec value.
const PART_NUMBER_RE = /\b([A-Z]{1,3}\d{5,8}-\d{4,6}|[A-Z]{1,3}\d{6,12}|\d{7,10}|\d{2,4}-\d{2,3}-\d{4,6}|\d{5}-\d{5})\b/;

export function isPartsQuery(query: string): boolean {
  return PARTS_KEYWORDS_RE.test(query)
    || HARGA_COMPONENT_RE.test(query)
    || PART_NUMBER_RE.test(query.toUpperCase());
}

export function extractPartNumber(query: string): string | null {
  const match = query.toUpperCase().match(PART_NUMBER_RE);
  return match ? match[1].trim() : null;
}


export function extractSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (isFaultCode(trimmed)) {
    // Normalize spacing variants: W:1208 → W: 1208 and vice versa
    const spaced   = trimmed.replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1: $2');
    const unspaced = trimmed.replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1:$2');
    const numOnly  = trimmed.replace(/^[A-Z]{1,3}\s*:?\s*/i, '');
    // Tambah strip-leading-zero variant sebagai variant terpisah:
    // "ENG:00436-04" → numOnly "00436-04" → stripped "00436-4"
    // "E03-01" → numOnly "03-01" → stripped "03-1" (E03-1 style codes)
    // Kedua variant dicoba paralel sehingga keyword hit untuk keduanya.
    const stripped = numOnly.replace(/-0+([0-9A-Fa-f]+)$/, '-$1');
    return [...new Set([trimmed, spaced, unspaced, numOnly, stripped])].filter(Boolean).slice(0, 5);
  }

  const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  if (words.length === 0) return [trimmed];

  const candidates: Array<{ text: string; score: number }> = [];
  for (let n = 3; n >= 2; n--) {
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n).join(' ');
      const score = words.slice(i, i + n).filter(w => TECH_TERMS.has(w)).length + (n === 3 ? 0.5 : 0);
      candidates.push({ text: gram, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  for (const c of candidates) {
    if (picked.length >= 2) break;
    if (!picked.some(p => p.includes(c.text) || c.text.includes(p))) picked.push(c.text);
  }

  return [trimmed, ...picked].slice(0, 3);
}

interface RerankedDoc { content: string; score: number }
interface RerankResult { docs: RerankedDoc[]; error?: string }

async function rerankWithCohere(query: string, docs: string[], topN: number): Promise<RerankResult> {
  if (docs.length === 0) return { docs: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${proxyUrl}/v1/rerank`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ query, documents: docs, topN }),
    });
    if (!res.ok) throw new Error(`Rerank proxy ${res.status}`);
    const data = await res.json();
    const ranked = (data.results as Array<{ index: number; relevance_score: number }>)
      .map(r => ({ content: docs[r.index], score: r.relevance_score }))
      .filter((d): d is RerankedDoc => typeof d.content === 'string');
    return { docs: ranked };
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    const errMsg = msg.includes('abort') ? 'Rerank timeout (5s)' : `Rerank error: ${msg}`;
    console.warn('Cohere rerank failed:', errMsg);
    // Fallback: pakai vector order, score=0.5 neutral (tidak trigger LOW tier)
    return { docs: docs.slice(0, topN).map(content => ({ content, score: 0.5 })), error: errMsg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confidence tier dari distribusi rerank score.
 *
 * Calibration v2 (post production observation):
 * - Cohere rerank-v4.0-fast keluar di range 0.35-0.65 untuk query teknis valid
 * - Threshold v1 (HIGH ≥0.5 AND gap ≥0.15) terlalu ketat → banyak false-positive MEDIUM
 *   pada kasus akurat ("berat swing motor" / "cara pengecekan swing") karena gap kecil
 *   saat banyak chunk sama-relevant
 * - Gap requirement diturunkan: bukan gap yang menentukan kualitas, tapi absolute score
 *
 *   HIGH   : topScore >= 0.45 (data relevan, no caveat)
 *   MEDIUM : topScore >= 0.25 (relevan tapi tidak persis, inject + caveat)
 *   LOW    : topScore <  0.25 (semua chunk meleset, bypass AI ke canned)
 */
function computeConfidence(scored: RerankedDoc[]): { confidence: 'high' | 'medium' | 'low'; topScore: number } {
  const topScore = scored[0]?.score ?? 0;
  if (topScore >= 0.45) return { confidence: 'high', topScore };
  if (topScore >= 0.25) return { confidence: 'medium', topScore };
  return { confidence: 'low', topScore };
}


// Daftar nama model — distrip dari query sebelum embedding karena model
// sudah difilter via Supabase metadata. Menyertakan nama model di query
// embedding akan bias vector search ke chunk yang literal mention model.
const MODEL_NAMES_RE = /\b(ZX48U-5A|ZX65USB-5A|ZX138MF-5G|ZX200-5G|KCM\s+60ZV)\b\s*/gi;

export function stripModelFromQuery(query: string): string {
  return query.replace(MODEL_NAMES_RE, '').replace(/\s+/g, ' ').trim();
}

// EXPAND: translate Indonesian terms → English equivalents for embedding query.
// RULES: (1) key hanya Indonesian/shorthand — BUKAN English term yang sudah jelas
//        (2) value TIDAK boleh mengandung key itu sendiri (mencegah duplikat)
//        (3) hanya expand kalau benar-benar menambah semantic meaning
const EXPAND: Record<string, string> = {
  // Indonesian mechanical terms → English
  hidrolik: 'hydraulic', hidraulik: 'hydraulic', pompa: 'pump',
  katup: 'valve', silinder: 'cylinder', tangki: 'tank', selang: 'hose',
  akumulator: 'accumulator', tekanan: 'pressure', aliran: 'flow',
  mesin: 'engine', turbo: 'turbocharger', injektor: 'injector',
  nosel: 'nozzle', kompresi: 'compression',
  solar: 'diesel fuel', bahan: 'fuel', urea: 'DEF urea',
  aki: 'battery', starter: 'starter motor', sekring: 'fuse',
  kabel: 'wiring harness', bantalan: 'bearing',
  sepatu: 'shoe track', final: 'final drive', travel: 'travel motor',
  // Symptoms
  bocor: 'leak', kebocoran: 'leak', panas: 'overheat', macet: 'stuck',
  tersumbat: 'clogged', lemah: 'weak power', lambat: 'slow response',
  getaran: 'vibration', aus: 'wear', rusak: 'failure', kerusakan: 'failure',
  kendur: 'slack', mati: 'not working',
  // Fluids / maintenance
  oli: 'oil', minyak: 'oil', pendingin: 'coolant', gemuk: 'grease',
  kapasitas: 'capacity', celah: 'clearance', toleransi: 'tolerance',
  spesifikasi: 'specification', kalibrasi: 'calibration',
  suhu: 'temperature', temperatur: 'temperature', putaran: 'rpm rotation',
  torsi: 'torque', kecepatan: 'speed',
  perawatan: 'maintenance', servis: 'service',
  sistem: 'system', kopling: 'clutch', rem: 'brake', rantai: 'chain',
  // Parts shorthand (lapangan) — value tidak mengandung key
  cyl: 'cylinder', cyls: 'cylinders', cilinder: 'cylinder',
  kit: 'assembly o-ring',   // 'kit assembly seal' → hapus 'kit' dari value
  seal: 'o-ring gasket',    // 'seal o-ring' → hapus 'seal' dari value
  blade: 'dozer cylinder',  // hapus 'blade' dari value
  dozer: 'blade cylinder',  // hapus 'dozer' dari value
  bucket: 'arm cylinder',   // hapus 'bucket' dari value
  arm: 'cylinder boom',     // hapus 'arm' dari value
  boom: 'cylinder hydraulic', // hapus 'boom' dari value
  asm: 'assembly', assy: 'assembly',
  pn: 'part number', nomor: 'number part',
  // Operator manual
  isi: 'capacity refill',
  cek: 'check inspect',
  jadwal: 'schedule maintenance interval',
  // Hydraulic circuit — value tidak mengandung key
  relief: 'valve pressure MPa',          // hapus 'relief'
  displacement: 'cm3 rev motor',         // hapus 'displacement'
  pilot: 'circuit pressure pump',        // hapus 'pilot'
  main: 'pump primary',                  // hapus 'main'
  pump: 'hydraulic variable piston',     // hapus 'pump'
  control: 'valve spool',                // hapus 'control'
  spool: 'valve control',               // hapus 'spool' (oke cross-ref sama 'control')
  port: 'relief pressure',              // hapus 'port'
};

const TECH_TERMS = new Set([
  ...Object.keys(EXPAND),
  ...Object.values(EXPAND).flatMap(v => v.split(' ')),
]);

const STOP_WORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'ada', 'apa', 'bagaimana',
  'kenapa', 'mengapa', 'cara', 'tolong', 'bantu', 'mohon', 'dengan', 'untuk',
  'pada', 'dalam', 'oleh', 'atau', 'juga', 'sudah', 'bisa', 'tidak', 'apakah',
  'akan', 'saya', 'unit', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'how', 'what', 'why', 'when', 'where', 'please', 'help', 'tell', 'me', 'about',
]);

// Kata yang menandakan query minta SPEC TERUKUR — dipakai searchTechnicalManualMulti
// untuk keyword-boost (pasangkan komponen + spec word) agar angka spec yang terkubur
// di chunk prosedur ketangkap (mis. "Swing device weight: 220 kg"). English + Indo.
const SPEC_TERMS = new Set([
  'weight', 'berat', 'torque', 'torsi', 'pressure', 'tekanan', 'clearance',
  'displacement', 'capacity', 'kapasitas', 'rpm', 'voltage', 'tegangan',
  'resistance', 'flow', 'dimension', 'dimensi', 'gap', 'speed',
]);

function expandQuery(query: string): string {
  // Limit max 3 ekspansi + dedupe per-token (cegah "seal kit" → 8 kata distorsi).
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const w of query.toLowerCase().split(/\s+/)) {
    const exp = EXPAND[w];
    if (!exp) continue;
    for (const tok of exp.split(/\s+/)) {
      if (!tok || seen.has(tok)) continue;
      seen.add(tok);
      extras.push(tok);
      if (extras.length >= 3) break;
    }
    if (extras.length >= 3) break;
  }
  return extras.length ? `${query} ${extras.join(' ')}` : query;
}

async function fetchEmbedding(query: string, cacheKey: string): Promise<number[]> {
  // Sanity guard: embed query terlalu pendek/cuma angka = vector tidak bermakna.
  // Apapun path yang nyasar ke sini, transform jadi query bermakna sebelum kirim.
  let safeQuery = query;
  const trimmedQ = query.trim();
  const intervalOnly = /^\s*(\d{3,5})\s*(?:jam|hm|hours?|hr)?\s*$/i.test(trimmedQ);
  if (intervalOnly) {
    const num = trimmedQ.match(/\d{3,5}/)?.[0] ?? trimmedQ;
    safeQuery = `${num} hour service maintenance schedule parts`;
    console.warn('[RAG] embed query too narrow, transformed:', { original: query, safeQuery });
  } else if (trimmedQ.split(/\s+/).filter(Boolean).length < 2) {
    console.warn('[RAG] embed query single word (low semantic signal):', query);
  }
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(`${proxyUrl}/v1/embed`, {
      method: 'POST', headers,
      body: JSON.stringify({ query: safeQuery }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Embed proxy ${res.status}`);
    const data   = await res.json() as { values?: unknown };
    const values = Array.isArray(data.values) ? (data.values as number[]) : null;
    if (!values || values.length === 0) throw new Error('Embed returned no values');
    setCached(cacheKey, values);
    return values;
  } finally {
    clearTimeout(timer);
  }
}

async function getEmbedding(query: string): Promise<number[]> {
  // Normalisasi cache key — "Seal Kit", "seal kit", "seal  kit" → 1 entry yang sama.
  // Penting agar tidak duplicate embed call & vector tetap konsisten.
  const cacheKey = query.toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Cache hit — kembalikan langsung tanpa network (promotes to MRU)
  const cached = getCachedLru(cacheKey);
  if (cached) return cached;

  // 2. In-flight dedup pakai key yang sama agar concurrent identical queries hanya 1 fetch
  const inFlight = embeddingInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  // 3. Fetch dengan query asli (proxy embed query string), cache pakai normalized key
  const promise = fetchEmbedding(query, cacheKey).finally(() => {
    embeddingInFlight.delete(cacheKey);
  });
  embeddingInFlight.set(cacheKey, promise);
  return promise;
}

export interface CatalogEntry { model: string; kategori: string; count: number }

export async function fetchDocumentCatalog(): Promise<CatalogEntry[]> {
  if (!supabase) return [];

  // PostgREST hardcode max 1000 row per request (meski .limit(10000) di-set).
  // Pakai pagination ADAPTIF — fetch 4 pages paralel batch pertama, lalu lanjut
  // sequential sampai page kosong. Akomodasi DB growth tanpa hard cap.
  // Sebelumnya: 6 pages × 1000 = max 6000 docs hard cap → bisa miss kalau DB > 6K.
  const PAGE_SIZE = 1000;
  const INITIAL_BATCH = 4;  // 4000 docs covered in 1 parallel batch (most common case)
  const MAX_SAFETY = 20;    // hard upper bound — 20K docs cap before warning

  type Row = { metadata: { Model?: string; Kategori?: string } };

  const fetchPage = async (pageIdx: number): Promise<Row[]> => {
    const result = await supabase!
      .from('documents')
      .select('metadata')
      .order('id', { ascending: true })
      .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1);
    return Array.isArray(result.data) ? (result.data as Row[]) : [];
  };

  // Batch 1: paralel 4 pages (cover typical DB size 0-4K)
  const initialSettled = await Promise.allSettled(
    Array.from({ length: INITIAL_BATCH }, (_, i) => fetchPage(i))
  );
  const allRows: Row[] = [];
  let lastPageFull = true;
  for (const r of initialSettled) {
    if (r.status === 'fulfilled') {
      allRows.push(...r.value);
      if (r.value.length < PAGE_SIZE) lastPageFull = false;
    } else {
      console.error('Catalog page fetch error:', r.reason);
      lastPageFull = false; // stop early on error
    }
  }

  // Batch 2+: continue sequential dari page INITIAL_BATCH sampai empty atau cap
  let nextPage = INITIAL_BATCH;
  while (lastPageFull && nextPage < MAX_SAFETY) {
    try {
      const rows = await fetchPage(nextPage);
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break; // partial page = last page
      nextPage++;
    } catch (err) {
      console.error('Catalog pagination error at page', nextPage, err);
      break;
    }
  }

  if (nextPage >= MAX_SAFETY) {
    console.warn('[fetchDocumentCatalog] hit safety cap', MAX_SAFETY, 'pages — DB may need pagination upgrade');
  }

  if (allRows.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of allRows) {
    const model = row.metadata?.Model;
    const kategori = row.metadata?.Kategori;
    if (!model || !kategori) continue;
    const key = `${model}||${kategori}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [model, kategori] = key.split('||');
    return { model, kategori, count };
  });
}

interface RAGResult {
  content: string;
  hasResults: boolean;
  ragError?: string;        // Set kalau embedding/rerank pipeline error — caller harus surface ke user
  confidence?: 'high' | 'medium' | 'low'; // Adaptive retrieval confidence dari rerank score distribution
  topScore?: number;        // Top rerank score (0..1) — untuk telemetry & calibration
}

// Mapping nama Kategori untuk fault-code/troubleshooting data per model.
// Naming inconsistency dari ingest:
// - ZX200-5G  → 'TROUBLESHOOTING'
// - KCM 60ZV  → 'WORKSHOP MANUAL' (tidak punya TM/Troubleshooting kategori, WM cover repair info)
// - default   → 'TECHNICAL MANUAL'
const TROUBLESHOOTING_KATEGORI_BY_MODEL: Record<string, string> = {
  'ZX200-5G': 'TROUBLESHOOTING',
  'KCM 60ZV': 'WORKSHOP MANUAL',
};
const DEFAULT_TROUBLESHOOTING_KATEGORI = 'TECHNICAL MANUAL';

function getTroubleshootingKategori(model: string): string {
  return TROUBLESHOOTING_KATEGORI_BY_MODEL[model] ?? DEFAULT_TROUBLESHOOTING_KATEGORI;
}

/**
 * Unified technical manual search — 1 embed per call (bukan per variant).
 * Sebelumnya searchTechnicalManualMulti → N×searchRawDocs → N embed calls.
 * Sekarang: keyword search semua variants paralel (gratis) + 1 vector search.
 * Untuk 4 variants: 4 embeds → 1 embed. Untuk 2 codes × 4 variants: 8 → 2.
 */
export async function searchTechnicalManualMulti(
  queries: string[],
  model: string,
  topN = 3,
  forceKategori?: string,  // override default routing — utk HCD search via tools
): Promise<RAGResult> {
  if (!supabase || queries.length === 0) return { content: '', hasResults: false };

  const primaryQuery = queries[0].trim();
  const faultCode    = isFaultCode(primaryQuery);
  // forceKategori menang di atas auto-routing — caller eksplisit minta kategori spesifik
  const strictFilter = forceKategori
    ? { Model: model, Kategori: forceKategori }
    : faultCode
      ? { Model: model, Kategori: getTroubleshootingKategori(model) }
      : { Model: model };
  const looseFilter  = { Model: model };

  // Normalize all queries for keyword search (colon spacing only, no strip)
  const normalizedQueries = queries.map(q =>
    faultCode
      ? q.trim().replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1: $2')
      : q.trim(),
  );

  // ── 1. Keyword searches — ALL variants in parallel, NO embed cost ──
  const kwPromises = normalizedQueries.map(sq =>
    supabase!.from('documents').select('content, metadata')
      .ilike('content', `%${sq}%`)
      .contains('metadata', strictFilter)
      .limit(5),
  );

  // ── 1b. Spec-aware keyword boost (non-fault-code) ──
  // Query spec terukur (weight/torque/pressure/dll) sering MISS: angkanya terkubur di
  // chunk prosedur panjang (embedding terdilusi) + mismatch istilah (user "swing motor"
  // vs manual "swing device"). Full-phrase ilike '%swing motor weight%' juga 0 match.
  // Fix: pasangkan TIAP kata komponen dengan kata spec via ilike AND (%swing% AND %weight%)
  // → baris "Swing device weight: 220 kg" ketangkap walau istilah beda. Hasil masuk rerank.
  const specPromises: typeof kwPromises = [];
  if (!faultCode) {
    const words = primaryQuery.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    const specWord = words.find(w => SPEC_TERMS.has(w));
    if (specWord) {
      const components = words.filter(w => w !== specWord && !STOP_WORDS.has(w)).slice(0, 3);
      for (const comp of components) {
        specPromises.push(
          supabase!.from('documents').select('content, metadata')
            .ilike('content', `%${comp}%`)
            .ilike('content', `%${specWord}%`)
            .contains('metadata', strictFilter)
            .limit(5),
        );
      }
    }
  }

  // ── 2. ONE embedding for vector search ──
  // Pakai primaryQuery langsung — JANGAN expandQuery() di sini.
  // expandQuery() dirancang untuk translate raw Indonesian → English (user input).
  // Query dari analyzeIntent sudah English-optimized, expandQuery justru MERUSAK:
  // "swing" → EXPAND["swing"]="swing" (circular, tambah duplikat "swing")
  // "kg" → EXPAND["kg"]="kg weight mass" (tambah "weight mass" redundan)
  // Hasilnya: "swing device weight specification" jadi "swing device weight specification swing kg weight mass"
  // Strip model name dari embedding query — model sudah difilter metadata Supabase.
  // Menyertakan "ZX48U-5A" di embedding akan bias vektor ke chunk yang literal
  // menyebut model, bukan chunk paling relevan secara konten.
  // Guard: kalau setelah strip jadi terlalu pendek (< 2 kata), fallback ke primaryQuery
  // tanpa strip — query 1 kata "weight" terlalu generik, embedding match terlalu banyak.
  const stripped = stripModelFromQuery(primaryQuery);
  const embeddingQuery = stripped.split(/\s+/).filter(Boolean).length >= 2
    ? stripped
    : primaryQuery;
  const [kwSettled, embeddingResult] = await Promise.allSettled([
    Promise.allSettled([...kwPromises, ...specPromises]),
    getEmbedding(embeddingQuery),
  ]);

  // Collect keyword hits
  const seen  = new Set<string>();
  const allDocs: string[] = [];

  if (kwSettled.status === 'fulfilled') {
    for (const r of kwSettled.value) {
      if (r.status !== 'fulfilled') continue;
      for (const d of r.value.data ?? []) {
        if (d?.content && !seen.has(d.content)) { seen.add(d.content); allDocs.push(d.content); }
      }
    }
  }

  // Fallback keyword to loose filter (all models) when strict Kategori filter returns nothing.
  // Track fallback so we can inject confidence caveat — data mungkin dari model/kategori lain.
  let usedLooseFallback = false;
  if (faultCode && allDocs.length === 0) {
    const fbPromises = normalizedQueries.map(sq =>
      supabase!.from('documents').select('content, metadata')
        .ilike('content', `%${sq}%`)
        .contains('metadata', looseFilter)
        .limit(5),
    );
    const fbResults = await Promise.allSettled(fbPromises);
    for (const r of fbResults) {
      if (r.status !== 'fulfilled') continue;
      for (const d of r.value.data ?? []) {
        if (d?.content && !seen.has(d.content)) { seen.add(d.content); allDocs.push(d.content); usedLooseFallback = true; }
      }
    }
  }

  // ONE vector search with single embedding.
  // match_count = 20: 20 candidates → Cohere rerank → top 3.
  // Per user feedback: 10 too narrow untuk query parts/spec yg butuh wide net
  // (mis. "harga bucket" miss section PROMO bucket teeth karena chunk lain
  // dominate top-10). Wider candidate pool → reranker pilih lebih akurat.
  if (embeddingResult.status === 'fulfilled') {
    const emb = embeddingResult.value;
    let { data: vecData } = await supabase.rpc('match_documents', {
      query_embedding: emb, match_count: 20, filter: strictFilter,
    });

    if (faultCode && (!Array.isArray(vecData) || vecData.length === 0)) {
      const { data: vecFallback } = await supabase.rpc('match_documents', {
        query_embedding: emb, match_count: 20, filter: looseFilter,
      });
      vecData = vecFallback;
    }

    const vecDocs = (Array.isArray(vecData) ? (vecData as SearchResult[]) : [])
      .filter(d => typeof d?.similarity === 'number' && d.similarity >= VECTOR_SIMILARITY_THRESHOLD);

    for (const d of vecDocs) {
      if (d.content && !seen.has(d.content)) { seen.add(d.content); allDocs.push(d.content); }
    }
  }

  if (allDocs.length === 0) return { content: '', hasResults: false };

  // Fault code literal-contain filter — prevent false positives from vector.
  // CRITICAL: juga cek stripped variant (tanpa leading zero di suffix).
  // Contoh: OCR detect "13006-02" tapi content simpan "13006-2".
  //   primaryQuery = "13006-02" → codeUpper = "13006-02" → MISS "13006-2"
  //   stripped     = "13006-2"  → HITS content "13006-2" ← harus lolos filter
  let filteredDocs = allDocs;
  if (faultCode) {
    const codeUpper = primaryQuery.toUpperCase();
    const numOnly   = codeUpper.replace(/^[A-Z]{1,3}\s*:?\s*/i, '');
    const stripped  = numOnly.replace(/-0+([0-9A-Fa-f]+)$/, '-$1'); // "13006-02" → "13006-2"
    filteredDocs = allDocs.filter(text => {
      const upper = text.toUpperCase();
      if (upper.includes(codeUpper)) return true;
      if (numOnly.length >= 4 && upper.includes(numOnly)) return true;
      // Accept stripped variant (leading-zero removed from suffix)
      if (stripped !== numOnly && stripped.length >= 4 && upper.includes(stripped)) return true;
      return false;
    });
  }

  if (filteredDocs.length === 0) {
    // Kalau embedding gagal DAN keyword juga tidak ada hasil → RAG pipeline error
    const embedFailed = embeddingResult.status === 'rejected';
    if (embedFailed && allDocs.length === 0) {
      const reason = (embeddingResult.reason as Error)?.message ?? 'Embedding service error';
      return { content: '', hasResults: false, ragError: reason };
    }
    return { content: '', hasResults: false };
  }

  const { docs: top, error: rerankErr } = await rerankWithCohere(primaryQuery, filteredDocs, topN);
  const { confidence, topScore } = computeConfidence(top);

  console.info('[confidence] tm tier=%s topScore=%s docs=%d',
    confidence, topScore.toFixed(2), top.length);

  // Loose-filter fallback → downgrade confidence ke medium supaya AI inject caveat verifikasi
  const effectiveConfidence = usedLooseFallback && confidence === 'high' ? 'medium' : confidence;
  // Strip prefix [Rank N] — itu metadata internal, AI tidak butuh nomor ranking.
  // SYSTEM_PROMPT instruct "JANGAN tampilkan [Rank N]" tapi safer kalau memang
  // tidak ada di context. Format pemisah --- saja sudah cukup.
  const content = top.map(t => t.content).join('\n\n---\n\n');
  return { content, hasResults: true, confidence: effectiveConfidence, topScore, ...(rerankErr ? { ragError: rerankErr } : {}) };
}

// Models yang punya ENGINE MANUAL di Supabase
// (Yanmar 4TNV88 untuk ZX48U-5A + ZX65USB-5A, engine lain untuk model lain)
const ENGINE_MANUAL_MODELS = new Set(['ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G']);

/**
 * Search ENGINE MANUAL by P-codes (e.g. ['P0340', 'P1340']).
 * Called as 2nd pass setelah fault code search TM, untuk dapat DTC
 * diagnosis procedure dari engine service manual (Yanmar, Isuzu, dll).
 */
export async function searchEngineManual(
  pCodes: string[],
  model: string,
  topN = 2,
): Promise<RAGResult> {
  if (!supabase || !ENGINE_MANUAL_MODELS.has(model) || pCodes.length === 0) {
    return { content: '', hasResults: false };
  }

  // Keyword-only — P-codes (P0340, P0119, dll) muncul LITERAL di DTC chunks
  // EM ("DTC P0340/4 Speed Sensor Error"). Tidak butuh vector embed.
  // Menghilangkan 1 embed call → total fault code path jadi 1 embed saja
  // (dari searchTechnicalManualMulti). Rerank via Cohere (bukan embed).
  const filter = { Model: model, Kategori: 'ENGINE MANUAL' };
  const seen = new Set<string>();
  const allDocs: string[] = [];

  const kwSettled = await Promise.allSettled(
    pCodes.map(pCode =>
      supabase!.from('documents').select('content')
        .ilike('content', `%${pCode}%`)
        .contains('metadata', filter)
        .limit(4),
    ),
  );

  for (const r of kwSettled) {
    if (r.status !== 'fulfilled') continue;
    for (const d of r.value.data ?? []) {
      if (!d?.content || seen.has(d.content)) continue;
      seen.add(d.content);
      allDocs.push(d.content);
    }
  }

  if (allDocs.length === 0) return { content: '', hasResults: false };

  const { docs: top, error: rerankErr } = await rerankWithCohere(pCodes[0], allDocs, topN);
  const { confidence, topScore } = computeConfidence(top);
  return {
    content: top.map(t => t.content).join('\n\n---\n\n'),  // strip [Rank N] prefix
    hasResults: top.length > 0,
    confidence,
    topScore,
    ...(rerankErr ? { ragError: rerankErr } : {}),
  };
}

// Active PROMO kategori — semua periode yang masih active di Supabase.
// URUTAN PENTING: lama → baru (paling kanan = paling baru/aktif).
// Tambah periode baru di AKHIR array (mis. ..., 'PROMO Q2 FY2026').
// Semua di-search paralel, tapi harga period TERBARU diprioritaskan (preferNewestPromo).
const ACTIVE_PROMO_KATEGORI = ['PROMO Q4 FY2025', 'PROMO Q1 FY2026'] as const;

// Prefer harga period TERBARU. Ambil semua chunk period terbaru, lalu tambah chunk period
// lama HANYA untuk section-type yang belum terwakili. Cegah AI lihat harga lama + baru
// sekaligus lalu salah pilih period kadaluarsa (bug: tampil harga Q4 padahal Q1 lebih baru).
// Section-type = teks setelah "PROMO QX FYXXXX - " sebelum "(" — sama antar period
// (FILTER PARTS, ELECTRICAL PARTS, COOLANT, dll) walau deskripsi dalam kurung beda.
type PromoChunk = { content: string; similarity?: number; match_type?: string };

function promoSectionKey(content: string): string {
  const m = content.match(/PROMO\s+Q\d\s+FY\d+\s*-\s*([^\n(]+)/i);
  return (m ? m[1] : '').trim().toUpperCase();
}

// byPeriod: array per period dalam urutan ACTIVE_PROMO_KATEGORI (lama → baru).
function preferNewestPromo(byPeriod: PromoChunk[][]): PromoChunk[] {
  const out: PromoChunk[] = [];
  const seen = new Set<string>();
  for (let i = byPeriod.length - 1; i >= 0; i--) {   // iterate newest → oldest
    const period = byPeriod[i];
    for (const d of period) {
      const key = promoSectionKey(d.content);
      if (key && seen.has(key)) continue;            // section sudah dari period lebih baru
      out.push(d);
    }
    for (const d of period) {                          // tandai section period ini SETELAH add
      const key = promoSectionKey(d.content);
      if (key) seen.add(key);
    }
  }
  return out;
}

// Engine PN patterns:
// - Isuzu 6BG1-TRA14 (ZX200-5G): pure 10-digit (e.g. 8981759510, 1153004210)
// - Yanmar 4TNV88-BPHBB (ZX48U/65USB): YNM-prefix + dash (e.g. YNM129150-14200)
// - Isuzu BB-6BG1T (KCM 60ZV): YZ-prefix + 10-12 digit (e.g. YZ0108060850, YZ18781231114)
// - Edge: DCA50000030001 (3-letter + 11-12 digit) — rare KCM engine variant
const ENGINE_PN_RE = /^(?:\d{10}|[A-Z]{2,3}\d{5,8}-\d{4,6}|[A-Z]{2,3}\d{10,12})$/i;

// Models yang punya ENGINE PARTS CATALOG di Supabase
// ZX200-5G : 33 sections (ISUZU 6BG1-TRA14)
// ZX48U-5A : 17 sections (YANMAR 4TNV88-BPHBB)
// KCM 60ZV : 1 chunk index/system code only — scanned PDF 102 hal, no PN spesifik
//            (cukup untuk routing keyword & AI saran "lihat catalog fisik")
const ENGINE_CATALOG_MODELS = new Set(['ZX200-5G', 'ZX48U-5A', 'KCM 60ZV']);

// Models yang BELUM punya PARTS CATALOG di Supabase (ingest pending).
// Saat searchPartsCatalog return empty untuk model ini → caller harus fallback
// ke Workshop Manual / Technical Manual yg punya PN inline.
export const MODELS_WITHOUT_PARTS_CATALOG = new Set(['ZX65USB-5A', 'ZX138MF-5G']);

/**
 * Search HANYA CPM + PROMO untuk service interval queries (mis. "service 2000 jam").
 * Tidak include PARTS CATALOG/ENGINE PARTS CATALOG karena ratusan PN tak relevan
 * untuk service interval = source of hallucination buat model.
 *
 * Coverage: CPM (1 chunk per model, full schedule) + semua ACTIVE_PROMO_KATEGORI (Q4 FY2025 + Q1 FY2026)
 */
export async function searchServiceIntervalParts(
  query: string,
  model: string,
): Promise<RAGResult> {
  if (!supabase) return { content: '', hasResults: false };

  const stripped = stripModelFromQuery(query.trim());
  let embedding: number[] | null = null;
  try {
    embedding = await getEmbedding(stripped);
  } catch (err) {
    console.warn('Embed failed for interval parts search:', err);
    return { content: '', hasResults: false };
  }
  if (!embedding) return { content: '', hasResults: false };

  type HybridResult = { content: string; similarity?: number; match_type?: string };

  const queryText = stripModelFromQuery(query.trim());

  // Search CPM + SEMUA active promo periods paralel.
  // Sebelumnya cuma Q4 FY2025 → MISS Q1 FY2026 yg sudah ter-ingest (39 chunks total).
  const cpmPromise = supabase.rpc('match_documents_hybrid', {
    query_text: queryText,
    query_embedding: embedding,
    match_count: 1,
    filter: { Model: model, Kategori: 'CPM' },
    similarity_threshold: 0.20,  // Threshold longgar — CPM 1 chunk only, harus selalu masuk
  }) as unknown as Promise<{ data: HybridResult[] | null }>;

  const promoPromises = ACTIVE_PROMO_KATEGORI.map(kat =>
    supabase.rpc('match_documents_hybrid', {
      query_text: queryText,
      query_embedding: embedding,
      match_count: 5,
      filter: { Model: model, Kategori: kat },
      similarity_threshold: 0.25,
    }) as unknown as Promise<{ data: HybridResult[] | null }>,
  );

  const [cpmRes, ...promoSettled] = await Promise.allSettled([cpmPromise, ...promoPromises]);

  const cpmData = cpmRes.status === 'fulfilled' && Array.isArray(cpmRes.value.data) ? cpmRes.value.data : [];
  // promoSettled urutannya = ACTIVE_PROMO_KATEGORI (lama → baru). Prefer harga period terbaru.
  const promoByPeriod: HybridResult[][] = promoSettled.map(r =>
    r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data : [],
  );
  const promoData: HybridResult[] = preferNewestPromo(promoByPeriod);

  if (cpmData.length === 0 && promoData.length === 0) {
    return { content: '', hasResults: false };
  }

  // Format: CPM dulu (primary source PN), lalu PROMO (untuk lookup harga)
  const all = [...cpmData, ...promoData];
  return {
    content: all.map(d => d.content).join('\n\n---\n\n'),
    hasResults: true,
  };
}

/**
 * Search parts catalog — section-based chunking, search BOTH catalogs paralel.
 *
 * Coverage: PARTS CATALOG (331 body sections) + ENGINE PARTS CATALOG (33 ISUZU 6BG1-TRA14 sections)
 *
 * Strategy:
 * - Part number 10-digit pure → likely engine, prioritize ENGINE PARTS CATALOG
 * - Otherwise → search BOTH catalogs paralel via match_documents_hybrid, merge & sort
 * - hybrid RPC sudah handle exact PN match (match_type='exact_part_no') + semantic
 */
export async function searchPartsCatalog(
  query: string,
  model: string,
  skipExpand = false,   // true kalau query sudah AI-optimized English (skip expandQuery)
): Promise<RAGResult> {
  if (!supabase) return { content: '', hasResults: false };

  const partNum = extractPartNumber(query);
  const isEnginePN = !!partNum && ENGINE_PN_RE.test(partNum);

  // Embed query strategy:
  // 1. Strip model name DULU (lebih bersih sebelum expand)
  // 2. Untuk PN literal: gabungkan PN + konteks asli, jangan embed PN saja (vector kabur)
  //    Filter exact PN tetap berjalan via match_documents_hybrid (match_type='exact_part_no')
  // 3. expandQuery hanya untuk raw Indonesian, skip kalau AI-optimized English
  const stripped = stripModelFromQuery(query.trim());
  const embedQuery = partNum
    ? stripped                                  // PN tetap dalam konteks (mis. "YB60000068 itu apa")
    : (skipExpand ? stripped : expandQuery(stripped));
  let embedding: number[] | null = null;
  try {
    embedding = await getEmbedding(embedQuery);
  } catch (err) {
    console.warn('Embed failed for parts search:', err);
    return { content: '', hasResults: false };
  }
  if (!embedding) return { content: '', hasResults: false };

  type HybridResult = { content: string; similarity?: number; match_type?: string };

  // Cek apakah model punya engine catalog (saat ini hanya ZX200-5G)
  const hasEngineCatalog = ENGINE_CATALOG_MODELS.has(model);

  // Search PARTS CATALOG (always) + ENGINE PARTS CATALOG (only if model has it).
  // Counts dinaikkan utk wider coverage — PROMO punya banyak section terpisah
  // (electrical / undercarriage / bucket teeth / dll). 3 chunks sebelumnya
  // miss section non-electrical untuk query 'harga bucket'.
  const bodyCount = (isEnginePN && hasEngineCatalog) ? 3 : 7;     // was 2/5
  const engineCount = isEnginePN ? 5 : 3;
  const promoCount = 5;                                           // was 3
  const cpmCount = 1;

  // Strip model name dari keyword text juga (query_text di hybrid RPC)
  // agar keyword component tidak terpolarisasi ke chunk yang literal menyebut model
  const queryText = stripModelFromQuery(query.trim());

  // Build queries dengan structured indexes — track per-kategori untuk assignment hasil yg benar.
  const PARTS_IDX = 0;
  const CPM_IDX   = 1;
  const PROMO_START_IDX = 2;
  const PROMO_END_IDX   = PROMO_START_IDX + ACTIVE_PROMO_KATEGORI.length;
  const ENGINE_IDX = hasEngineCatalog ? PROMO_END_IDX : -1;

  const queries: Promise<{ data: HybridResult[] | null }>[] = [
    // 0. PARTS CATALOG — body/hydraulic/frame/cab sections
    supabase.rpc('match_documents_hybrid', {
      query_text: queryText,
      query_embedding: embedding,
      match_count: bodyCount,
      filter: { Model: model, Kategori: 'PARTS CATALOG' },
      similarity_threshold: 0.28,
    }) as unknown as Promise<{ data: HybridResult[] | null }>,
    // 1. CPM — maintenance schedule PNs dengan interval jam operasi
    supabase.rpc('match_documents_hybrid', {
      query_text: queryText,
      query_embedding: embedding,
      match_count: cpmCount,
      filter: { Model: model, Kategori: 'CPM' },
      similarity_threshold: 0.30,
    }) as unknown as Promise<{ data: HybridResult[] | null }>,
  ];

  // 2+. SEMUA active PROMO periods (Q4 FY2025 + Q1 FY2026 sekarang).
  //     Threshold lower utk capture section non-electrical (undercarriage/bucket teeth/dll).
  for (const promoKat of ACTIVE_PROMO_KATEGORI) {
    queries.push(
      supabase.rpc('match_documents_hybrid', {
        query_text: queryText,
        query_embedding: embedding,
        match_count: promoCount,
        filter: { Model: model, Kategori: promoKat },
        similarity_threshold: 0.25,
      }) as unknown as Promise<{ data: HybridResult[] | null }>,
    );
  }

  if (hasEngineCatalog) {
    queries.push(
      supabase.rpc('match_documents_hybrid', {
        query_text: queryText,
        query_embedding: embedding,
        match_count: engineCount,
        filter: { Model: model, Kategori: 'ENGINE PARTS CATALOG' },
        similarity_threshold: 0.28,
      }) as unknown as Promise<{ data: HybridResult[] | null }>,
    );
  }

  const settled = await Promise.allSettled(queries);
  const getData = (idx: number): HybridResult[] =>
    idx >= 0 && settled[idx]?.status === 'fulfilled' && Array.isArray(settled[idx].value.data)
      ? settled[idx].value.data
      : [];

  const bodyData: HybridResult[]   = getData(PARTS_IDX);
  const cpmData: HybridResult[]    = getData(CPM_IDX);
  // Prefer harga period TERBARU — period lama cuma untuk section yang tidak ada di terbaru.
  // getData index PROMO_START_IDX..PROMO_END_IDX = urutan ACTIVE_PROMO_KATEGORI (lama → baru).
  const promoByPeriod: HybridResult[][] = [];
  for (let i = PROMO_START_IDX; i < PROMO_END_IDX; i++) {
    promoByPeriod.push(getData(i));
  }
  const promoData: HybridResult[] = preferNewestPromo(promoByPeriod);
  const engineData: HybridResult[] = ENGINE_IDX >= 0 ? getData(ENGINE_IDX) : [];

  // Fallback ke match_documents standard kalau hybrid RPC error (mis. function not deployed)
  if (bodyData.length === 0 && engineData.length === 0 && promoData.length === 0 && cpmData.length === 0) {
    const fallbackQueries = [
      supabase.rpc('match_documents', {
        query_embedding: embedding, match_count: 5,
        filter: { Model: model, Kategori: 'PARTS CATALOG' },
      }),
    ];
    if (hasEngineCatalog) {
      fallbackQueries.push(
        supabase.rpc('match_documents', {
          query_embedding: embedding, match_count: 3,
          filter: { Model: model, Kategori: 'ENGINE PARTS CATALOG' },
        }),
      );
    }
    const fallbackResults = await Promise.allSettled(fallbackQueries);
    const allFallback = fallbackResults
      .flatMap(r => r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data as SearchResult[] : [])
      .filter(d => d.similarity >= 0.30)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
    if (allFallback.length === 0) return { content: '', hasResults: false };
    return {
      content: allFallback.map(d => d.content).join('\n\n---\n\n'),
      hasResults: true,
    };
  }

  // CPM selalu duluan di context — model lebih perhatian ke awal prompt.
  // Lalu exact_part_no match, lalu similarity. PROMO setelah CPM.
  const nonCpm = [...bodyData, ...engineData, ...promoData];
  nonCpm.sort((a, b) => {
    const aExact = a.match_type === 'exact_part_no' ? 1 : 0;
    const bExact = b.match_type === 'exact_part_no' ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });
  const merged = [...cpmData, ...nonCpm];

  // Ambil top 12 (naik dari 7) agar lebih banyak section PROMO/PARTS terwakili.
  // Compression akan extract baris relevan dari banyak section sebelum AI dapat context.
  const top = merged.slice(0, 12);
  if (top.length === 0) return { content: '', hasResults: false };

  console.info('[parts] cpm=%d body=%d engine=%d promo=%d (Q4+Q1) → top=%d',
    cpmData.length, bodyData.length, engineData.length, promoData.length, top.length);

  return {
    content: top.map(d => d.content).join('\n\n---\n\n'),
    hasResults: true,
  };
}
