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
  // Null = user belum login (Dash5 wajib login sebelum akses chat).
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

// ── Bookmark sinkron lintas perangkat ────────────────────────────────────────
// Tabel `bookmarks` (RLS per-user). Client tetap menulis localStorage sebagai cache
// offline; fungsi-fungsi ini fail-silent — offline berarti pakai cache lokal saja.
export interface RemoteBookmark { message_id: string; model: string; question: string; answer: string; saved_at: string }

export async function fetchBookmarksRemote(userId: string): Promise<RemoteBookmark[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('bookmarks')
    .select('message_id, model, question, answer, saved_at')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
    .limit(30);
  if (error) { console.warn('[bookmark] fetch remote gagal (offline?):', error.message); return null; }
  return data ?? [];
}

export async function upsertBookmarkRemote(
  userId: string,
  b: { id: string; model: string; question: string; answer: string; savedAt: number },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('bookmarks').upsert({
    user_id: userId, message_id: b.id, model: b.model, question: b.question,
    answer: b.answer, saved_at: new Date(b.savedAt).toISOString(),
  }, { onConflict: 'user_id,message_id' });
  if (error) console.warn('[bookmark] simpan remote gagal (offline?):', error.message);
}

export async function deleteBookmarkRemote(userId: string, messageId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('bookmarks').delete()
    .eq('user_id', userId).eq('message_id', messageId);
  if (error) console.warn('[bookmark] hapus remote gagal (offline?):', error.message);
}

// ── Feedback learning loop ──────────────────────────────
// Persist rating 👍/👎 + Q/A → sinyal audit jawaban buruk. Fire-and-forget, fail-silent.
export async function saveFeedback(payload: {
  userId: string;
  messageId: string;
  rating: 'up' | 'down';
  question: string;
  answer: string;
  model: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('message_feedback').upsert({
      user_id: payload.userId,
      message_id: payload.messageId,
      rating: payload.rating,
      question: payload.question.slice(0, 2000),
      answer: payload.answer.slice(0, 8000),
      model: payload.model,
      created_at: new Date().toISOString(),
    }, { onConflict: 'message_id' });
    if (error) console.warn('[feedback] tidak tersimpan (tabel message_feedback ada?):', error.message);
  } catch (e) {
    console.warn('[feedback] gagal simpan:', (e as Error)?.message);
  }
}

// Pre-filter recall gate sebelum rerank.
// ⚠️ ANGKA 0.30 DULU **TIDAK MENYARING APA PUN** — diukur langsung di DB (Agu 2026):
// chunk PALING TIDAK MIRIP se-ZX200-5G masih cosine 0.648, dan 1.259 dari 1.259 chunk
// lolos ambang 0.30. Ruang embedding korpus ini sangat padat: dua chunk ACAK beda
// kategori rata-rata 0.734 (rentang 0.67-0.82), dan sebaran 20 tetangga terdekat cuma
// 0.966→0.890. Penyebabnya chunk kepanjangan (rata-rata 2.802 char) — satu kalimat
// fakta ("weight: 48 kg") cuma ~1% dari vektor, jadi jarak cosine tak bisa membedakannya.
// ⚠️ SENGAJA DIBIARKAN 0.30 — jangan dinaikkan tanpa mengukur ulang dengan BENAR.
// Angka 0.648/0.734 di atas diukur DOKUMEN-ke-DOKUMEN. Similarity QUERY-ke-dokumen
// (query pendek, task_type RETRIEVAL_QUERY) bisa duduk jauh lebih rendah, dan itu
// BELUM pernah diukur — tak ada cara meng-embed query dari sesi analisis.
// Menaikkan ambang = risiko membuang kandidat sah, tanpa manfaat yang terbukti:
// jumlah kandidat sudah dibatasi VECTOR_MATCH_COUNT + RERANK_INPUT_CAP, dan penyaring
// sesungguhnya adalah Cohere rerank (cross-encoder — membaca query + dokumen bersamaan,
// jadi SANGGUP menemukan angka di tengah chunk panjang). Ambang ini cuma jaring kasar.
const VECTOR_SIMILARITY_THRESHOLD = 0.30;
// Cap dokumen yang dikirim ke Cohere rerank — INI PENYUMBANG LATENSI TERBESAR di
// rantai pencarian, karena biaya rerank naik seiring jumlah dokumen.
//
// Riwayat penyetelan (jangan diulang dari nol):
//   15 → bottleneck MUTU. 6 slot teratas selalu dihabiskan keyword RPC, menyisakan ~9
//        slot vector = jendela recall 0,7% dari 1.259 chunk. Kasus nyata: "berapa berat
//        swing motor" → chunk jawaban ("swing motor assembly weight: 48 kg") tak pernah
//        masuk kandidat, AI menjawab 220 kg (itu swing DEVICE) sambil bilang data tak ada.
//   45 → mutu beres tapi LATENSI TERASA BERAT oleh Alvian di produksi.
//   24 → latensi turun, mutu masih terjaga.
//   12 → dipakai sekarang atas permintaan Alvian (latensi jadi prioritas, 15 Agu 2026).
//        ⚠️ Angka ini di BAWAH cap awal (15), jadi HANYA aman karena kandidat sekarang
//        DISILANG keyword/vector (lihat blok penggabungan di searchTechnicalManualMulti).
//        Tanpa penyilangan, 12 slot akan dimakan 10 keyword dan vector cuma sisa 2.
//        JANGAN kembalikan urutan "keyword dulu semua" selama cap masih serendah ini.
const RERANK_INPUT_CAP = 12;
// Kandidat vector sebelum cap di atas. Disamakan dengan RERANK_INPUT_CAP — mengambil
// lebih banyak dari yang bisa dipakai cuma menambah payload tanpa menambah pilihan.
// DIUKUR: match_count 20 vs 40 sama-sama ~25 ms (top-N heapsort, 27 kB memory), jadi
// angka ini BUKAN sumber latensi. Sempat terbaca 269 ms — itu cold cache, bukan biaya nyata.
const VECTOR_MATCH_COUNT = 24;
// Pagar ukuran badan request rerank.
// ⚠️ KOREKSI: pagar ini semula dipasang karena dikira 45 × 27.812 char (chunk terbesar)
// akan menjebol `express.json({ limit: '1mb' })` di /v1/rerank. ITU KELIRU — `rerankWithCohere`
// sudah memotong tiap dokumen ke RERANK_DOC_CAP (2.500 char) sebelum dikirim, jadi payload
// maksimal sebenarnya 24 × 2.500 ≈ 60 KB. Budget di bawah ini TIDAK PERNAH tersentuh.
// Tetap dipertahankan sebagai jaring pengaman kalau RERANK_DOC_CAP dinaikkan/dihapus nanti.
const RERANK_PAYLOAD_BUDGET_CHARS = 500_000;

/** Ambil dokumen sebanyak mungkin untuk rerank, dibatasi JUMLAH dan TOTAL UKURAN.
 *  Selalu kembalikan minimal 1 dokumen — kalau chunk pertama sendiri melebihi budget,
 *  tetap kirim (Cohere yang memotong), sebab mengirim nol dokumen = rerank pasti gagal. */
function capRerankPayload(docs: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const d of docs) {
    if (out.length >= RERANK_INPUT_CAP) break;
    if (out.length > 0 && total + d.length > RERANK_PAYLOAD_BUDGET_CHARS) break;
    out.push(d);
    total += d.length;
  }
  if (out.length < docs.length) {
    console.info('[rerank] payload dipangkas: %d→%d dokumen (%d KB)',
      docs.length, out.length, Math.round(total / 1024));
  }
  return out;
}
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
  // WAJIB ada digit (cegah "blade"/"cafe" false-positive). Letter-prefix tanpa dash wajib ≥4 digit
  // (cegah fuel grade "B50"/"B100"). Konsisten dgn FAULT_CODE_PATTERN di ai.ts.
  return /^(?:[A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}(?:-[0-9A-F]{1,4})?)$/i.test(query.trim());
}

// Parts catalog detection — keyword + part number patterns
const PARTS_KEYWORDS_RE = /\b(part\s*number|part\s*no\.?|p\/?n[\s:]+\w|spare\s*part|suku\s*cadang|nomor\s*part|kode\s*part|harga\s*part|katalog\s*part|parts?\s*catalog|cross[-\s]?ref(?:erence)?|kompatibel|compatibility|substitu(?:te|si)|pengganti\s*part)\b/i;

// Price query Indonesia ('harga seal kit') — PARTS_KEYWORDS_RE butuh kata 'part', jadi ini pelengkap.
const HARGA_COMPONENT_RE = /\b(?:harga|price)\s+(?:promo\s+)?(?:seal|kit|pump|valve|motor|cylinder|filter|gasket|bearing|o-?ring|element|hose|sensor|coupling|grease|oil|coolant|breaker|controller|reman|rotor|piston|spring|nozzle|injector|alternator|starter|battery|belt|fan|radiator|shaft)\b/i;

// PN patterns: Yanmar YNM129150-14200 · Hitachi body YB60000068 · KCM engine YZ0108060850 ·
// Isuzu/Hitachi pure 4616545 · Komatsu 423-27-21370 · KCM 60ZV 34820-66720 · ZW140 163E3-42241.
// Range \d{6,12} hindari false-positive 4-5 digit (service interval / spec value).
const PART_NUMBER_RE = /\b([A-Z]{1,3}\d{5,8}-\d{4,6}|[A-Z]{1,3}\d{6,12}|\d{7,10}|\d{2,4}-\d{2,3}-\d{4,6}|\d[0-9A-Z]{4}-\d{5})\b/;

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
    // Strip-leading-zero variant ("00436-04" → "00436-4") dicoba paralel utk keyword hit keduanya.
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

// Cap per-dokumen KHUSUS payload skoring rerank. Sinyal relevansi ada di header chunk
// (Section:/Model:/Kategori:) + baris-baris awal; chunk tipikal 1-2rb char tidak tersentuh,
// hanya outlier jumbo (sampai 8rb) yang dipangkas. Konten UTUH tetap dipakai untuk jawaban —
// mapping via index ke array asli. Efek: upload dari HP lapangan & token Cohere turun drastis
// di kasus terburuk → tail-latency rerank terpangkas tanpa mengubah pemilihan chunk tipikal.
const RERANK_DOC_CAP = 2500;

async function rerankWithCohere(query: string, docs: string[], topN: number): Promise<RerankResult> {
  if (docs.length === 0) return { docs: [] };

  const controller = new AbortController();
  // 8s: margin buat rerank-pro (lebih lambat) dgn input di-cap (RERANK_INPUT_CAP) supaya tak abort
  // & fallback ke urutan vektor.
  const timer = setTimeout(() => controller.abort(), 8000);

  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const scoringDocs = docs.map(d => d.length > RERANK_DOC_CAP ? d.slice(0, RERANK_DOC_CAP) : d);

  try {
    const res = await fetch(`${proxyUrl}/v1/rerank`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ query, documents: scoringDocs, topN }),
    });
    if (!res.ok) throw new Error(`Rerank proxy ${res.status}`);
    const data = await res.json();
    const ranked = (data.results as Array<{ index: number; relevance_score: number }>)
      .map(r => ({ content: docs[r.index], score: r.relevance_score }))
      .filter((d): d is RerankedDoc => typeof d.content === 'string');
    return { docs: ranked };
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    const errMsg = msg.includes('abort') ? 'Rerank timeout (8s)' : `Rerank error: ${msg}`;
    console.warn('Cohere rerank failed:', errMsg);
    // Fallback: pakai vector order, score=0.5 neutral (tidak trigger LOW tier)
    return { docs: docs.slice(0, topN).map(content => ({ content, score: 0.5 })), error: errMsg };
  } finally {
    clearTimeout(timer);
  }
}

/** Confidence tier dari rerank score (calibration v2, Cohere valid range ~0.35-0.65).
 *  HIGH ≥0.45 (no caveat) · MEDIUM ≥0.25 (inject + caveat) · LOW <0.25 (fallback/canned). */
function computeConfidence(scored: RerankedDoc[]): { confidence: 'high' | 'medium' | 'low'; topScore: number } {
  const topScore = scored[0]?.score ?? 0;
  if (topScore >= 0.45) return { confidence: 'high', topScore };
  if (topScore >= 0.25) return { confidence: 'medium', topScore };
  return { confidence: 'low', topScore };
}

// ── MMR (Maximal Marginal Relevance) ────────────────────────────────────────
// Pilih dokumen relevan TAPI saling melengkapi (bukan top-k yg isinya 3 chunk kembar).
// MMR = argmax[ λ·relevance − (1−λ)·max overlap ]. Redundansi via Jaccard token (deterministik).
function mmrTokens(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}
function mmrJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
function mmrSelect(docs: RerankedDoc[], finalN: number, lambda = 0.7): RerankedDoc[] {
  if (docs.length <= finalN) return docs;
  const pool = docs.map(d => ({ d, tok: mmrTokens(d.content) }));
  pool.sort((a, b) => b.d.score - a.d.score);
  const selected = [pool.shift()!]; // seed: relevansi tertinggi
  while (selected.length < finalN && pool.length > 0) {
    let bestIdx = 0, best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      let maxSim = 0;
      for (const s of selected) maxSim = Math.max(maxSim, mmrJaccard(pool[i].tok, s.tok));
      const mmr = lambda * pool[i].d.score - (1 - lambda) * maxSim;
      if (mmr > best) { best = mmr; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected.map(s => s.d);
}


// Nama model distrip dari query sebelum embedding (sudah difilter via metadata) — kalau ikut,
// vektor bias ke chunk yg literal mention model, bukan konten relevan.
const MODEL_NAMES_RE = /\b(ZX48U-5A|ZX65USB-5A|ZX138MF-5G|ZX200-5G|KCM\s+60ZV|ZW140(?:-\w+)?)\b\s*/gi;

/** Escape wildcard LIKE (`%`, `_`, `\`) dari input user sebelum masuk pola ilike.
 *  Bukan SQL injection (PostgREST tetap parameterisasi), tapi tanpa ini user bisa
 *  mengirim `%` → pola liar → full scan berat / hasil kacau. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => `\\${m}`);
}

export function stripModelFromQuery(query: string): string {
  return query.replace(MODEL_NAMES_RE, '').replace(/\s+/g, ' ').trim();
}

// EXPAND: Indonesian → English untuk embedding query. Rules: (1) key hanya Indo/shorthand,
// (2) value TAK boleh mengandung key-nya sendiri (cegah duplikat), (3) hanya kalau menambah makna.
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

// Pertanyaan yang MENUNTUT NILAI terukur walau tanpa kata spec baku ("berapa minimum…",
// "standar normalnya berapa"). Memicu bonus ANGKA+SATUAN di retrieval ber-peringkat.
const NUMERIC_INTENT_RE = /\b(berapa|nilai|standar|standard|spesifikasi|spec|minimum|minimal|maksimum|maksimal|normal|batas|limit|toleransi|range)\b/i;

// Kata SPEC TERUKUR — dipakai keyword-boost (komponen + spec word) agar angka spec terkubur di
// chunk prosedur ketangkap (mis. "Swing device weight: 220 kg"). English + Indo.
const SPEC_TERMS = new Set([
  'weight', 'berat', 'torque', 'torsi', 'pressure', 'tekanan', 'clearance',
  'displacement', 'capacity', 'kapasitas', 'rpm', 'voltage', 'tegangan',
  'resistance', 'flow', 'dimension', 'dimensi', 'gap', 'speed',
  // Dimensi/ukuran — sering ditanya untuk pin/shaft/bushing/bore
  'diameter', 'dia', 'length', 'panjang', 'width', 'lebar', 'height', 'tinggi',
  'thickness', 'tebal', 'size', 'ukuran', 'stroke', 'depth', 'bore',
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
    let values = Array.isArray(data.values) ? (data.values as number[]) : null;
    if (!values || values.length === 0) throw new Error('Embed returned no values');
    // Bulatkan ke 6 desimal — payload RPC vector turun ±45% (3072 dim × float panjang → pendek).
    // Efek ke cosine similarity ~1e-6 (jauh di bawah noise antar-query) — hasil ranking identik.
    // Penting di koneksi lapangan: parts search kirim vector ini 3-4× paralel per pertanyaan.
    values = values.map(v => Math.round(v * 1e6) / 1e6);
    setCached(cacheKey, values);
    return values;
  } finally {
    clearTimeout(timer);
  }
}

/** Diexport utk semantic cache — LRU + in-flight dedup di dalamnya cegah embed ganda. */
export async function getEmbedding(query: string): Promise<number[]> {
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

// Memo 10 menit — census dokumen nyaris statis, tapi query-nya berat (paging metadata SEMUA
// dokumen, bisa >10 halaman × 1000 baris). Buka-tutup dashboard berulang jangan mengunduh ulang.
let _catalogCache: { data: CatalogEntry[]; expiresAt: number } | null = null;
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchDocumentCatalog(): Promise<CatalogEntry[]> {
  if (!supabase) return [];
  if (_catalogCache && Date.now() < _catalogCache.expiresAt && _catalogCache.data.length > 0) {
    return _catalogCache.data;
  }

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

  const result = Array.from(counts.entries()).map(([key, count]) => {
    const [model, kategori] = key.split('||');
    return { model, kategori, count };
  });
  _catalogCache = { data: result, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
  return result;
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
  // ZW140: fault code (14102-2 dll) ADA di TROUBLESHOOTING (23 chunk, verified
  // Jul 2026). TECHNICAL MANUAL-nya deskripsi sistem — 0 chunk fault code.
  'ZW140': 'TROUBLESHOOTING',
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
  topN = 3,   // 3 chunk final (5 → 4 → 3, diturunkan bertahap atas permintaan Alvian karena
              // latensi jadi prioritas, 15 Agu 2026). Konteks ke Gemini ~40% lebih kecil
              // dibanding 5 → input token turun → token pertama muncul lebih cepat.
              // ⚠️ Ini angka paling sensitif ke MUTU jawaban. Kalau diagnosa gejala mulai
              // kehilangan cabang (mis. E-8 Travel HP Mode + E-13 overload butuh 2 tabel
              // troubleshooting sekaligus), inilah yang pertama harus dinaikkan lagi.
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
  // Fault code: WAJIB exact-substring (kode harus muncul literal). Non-fault-code pakai
  // jalur ber-peringkat di bawah, jadi ilike arbitrer ini hanya untuk fault code.
  const kwPromises = faultCode
    ? normalizedQueries.map(sq =>
        supabase!.from('documents').select('content, metadata')
          .ilike('content', `%${escapeLike(sq)}%`)
          .contains('metadata', strictFilter)
          .limit(5),
      )
    : [];

  // ── 1b. Keyword BER-PERINGKAT (non-fault-code) ──
  // Dulu: `ilike %kata% limit 5` TANPA ORDER BY. Untuk "main pump pressure" ada 166 chunk
  // cocok → 5 yang terambil ARBITRER (peluang chunk jawaban ikut ≈3%; kasus nyata: nilai
  // P-Q Diagram tak pernah ketemu). Sekarang ranking dikerjakan RPC di database:
  // cocok-berapa-kata + bonus ANGKA+SATUAN (khusus pertanyaan nilai) + bonus tabel spec
  // resmi − penalti materi marketing. Fallback ke cara lama kalau RPC belum ter-deploy.
  const rankedPromise: Promise<string[]> = (async () => {
    if (faultCode) return [];
    const words = primaryQuery.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^\w°·/-]/g, ''))
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (words.length === 0) return [];
    // Frasa penuh ikut jadi term → chunk yang memuat frasa utuh dapat skor ekstra.
    // + PASANGAN BERURUTAN (bigram): manual jarang menulis frasa query persis apa adanya
    //   ("swing motor weight" tak pernah muncul — yang tertulis "swing motor ASSEMBLY weight"),
    //   jadi frasa penuh sering menyumbang NOL. Bigram "swing motor" tetap kena → term
    //   paling diskriminatif akhirnya ikut menyumbang skor.
    // BIAYA TERUKUR (EXPLAIN ANALYZE ×4, ZX200-5G) — JUMLAH TERM adalah SATU-SATUNYA
    // variabel mahal di RPC ini, sekitar +35 ms per term:
    //     6 term 240 ms · 7 term 283 ms · 10 term 387 ms
    // Sebaliknya p_match_count TIDAK berbiaya: ambil 6/8/10/12 sama-sama ~240 ms
    // (LIMIT tidak mengubah pemindaian). Jadi: hemat di TERM, jangan di recall.
    // 7 = cukup untuk frasa penuh + semua bigram query pendek. Query pendek seperti
    // "swing motor weight" cuma menghasilkan 6 term, jadi tak tersentuh batas ini.
    const bigrams = words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);
    const terms = [...new Set([primaryQuery.toLowerCase().trim(), ...bigrams, ...words])].slice(0, 7);
    // Pertanyaan NILAI terukur? → aktifkan bonus angka+satuan.
    const wantsNumber = words.some(w => SPEC_TERMS.has(w)) || NUMERIC_INTENT_RE.test(primaryQuery);

    const { data, error } = await supabase!.rpc('match_documents_keyword_ranked', {
      // 10 (dari 6). Sengaja TIDAK ikut diturunkan saat latensi dipangkas: sudah diukur
      // bahwa p_match_count tidak berbiaya sama sekali (6/8/10/12 → sama ~240 ms).
      // Menurunkannya cuma mengorbankan recall tanpa menghemat waktu sedetik pun.
      p_terms: terms, p_filter: strictFilter, p_numeric: wantsNumber, p_match_count: 10,
    });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : [])
      .map((d: { content?: string }) => d?.content)
      .filter((c): c is string => typeof c === 'string');
  })().catch(async err => {
    console.warn('[rank] RPC gagal, fallback keyword lama:', (err as Error)?.message);
    const words = primaryQuery.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    const specWord = words.find(w => SPEC_TERMS.has(w));
    if (!specWord) return [];
    const comps = words.filter(w => w !== specWord && !STOP_WORDS.has(w)).slice(0, 3);
    const res = await Promise.allSettled(comps.map(comp =>
      supabase!.from('documents').select('content')
        .ilike('content', `%${escapeLike(comp)}%`)
        .ilike('content', `%${escapeLike(specWord)}%`)
        .contains('metadata', strictFilter)
        .limit(5)));
    return res.flatMap(r => r.status === 'fulfilled'
      ? (r.value.data ?? []).map((d: { content?: string }) => d?.content).filter((c): c is string => !!c)
      : []);
  });

  // ── 2. ONE embedding for vector search ──
  // JANGAN expandQuery di sini (query analyzeIntent sudah English → expandQuery malah bikin duplikat).
  // Strip nama model (sudah difilter metadata; kalau ikut, vektor bias ke chunk yg literal mention model).
  // Guard: kalau strip jadi <2 kata → fallback primaryQuery (1 kata "weight" terlalu generik).
  const stripped = stripModelFromQuery(primaryQuery);
  const embeddingQuery = stripped.split(/\s+/).filter(Boolean).length >= 2
    ? stripped
    : primaryQuery;

  // Vector search DIRANTAI langsung ke promise embedding → jalan paralel penuh dgn keyword
  // search. Dulu: tunggu keyword+embed selesai dulu, BARU rpc (+0.3-0.8s serial tiap query).
  const vectorPromise: Promise<SearchResult[]> = getEmbedding(embeddingQuery).then(async emb => {
    let { data: vecData } = await supabase!.rpc('match_documents', {
      query_embedding: emb, match_count: VECTOR_MATCH_COUNT, filter: strictFilter,
    });
    if (faultCode && (!Array.isArray(vecData) || vecData.length === 0)) {
      const { data: vecFallback } = await supabase!.rpc('match_documents', {
        query_embedding: emb, match_count: VECTOR_MATCH_COUNT, filter: looseFilter,
      });
      vecData = vecFallback;
    }
    return (Array.isArray(vecData) ? (vecData as SearchResult[]) : [])
      .filter(d => typeof d?.similarity === 'number' && d.similarity >= VECTOR_SIMILARITY_THRESHOLD);
  });

  const [kwSettled, rankedSettled, vectorSettled] = await Promise.allSettled([
    Promise.allSettled(kwPromises),
    rankedPromise,
    vectorPromise,
  ]);

  // Kandidat dikumpulkan ke DUA daftar terpisah dulu, lalu DISILANG.
  //
  // ⚠️ KENAPA DISILANG, JANGAN DIKEMBALIKAN KE "KEYWORD DULU SEMUA":
  // dulu keyword diisi semua lebih dulu, baru vector. Itu aman waktu cap masih besar,
  // tapi RERANK_INPUT_CAP sekarang 12 — dengan p_match_count 10, keyword akan memakan
  // 10 dari 12 slot dan menyisakan HANYA 2 untuk vector. Itu lebih buruk daripada
  // kondisi awal (cap 15 = 6 keyword + 9 vector) dan membatalkan perbaikan recall.
  // Dengan silang, cap memotong ADIL: 12 slot ≈ 6 keyword + 6 vector.
  // Slot pertama tetap milik keyword, jadi fault code (yang butuh kecocokan literal)
  // tidak dirugikan.
  const kwDocs:  string[] = [];
  const vecDocs: string[] = [];

  if (rankedSettled.status === 'fulfilled') {
    for (const c of rankedSettled.value) if (c) kwDocs.push(c);
  }

  if (kwSettled.status === 'fulfilled') {
    for (const r of kwSettled.value) {
      if (r.status !== 'fulfilled') continue;
      for (const d of r.value.data ?? []) if (d?.content) kwDocs.push(d.content);
    }
  }

  if (vectorSettled.status === 'fulfilled') {
    for (const d of vectorSettled.value) if (d.content) vecDocs.push(d.content);
  }

  const seen  = new Set<string>();
  const allDocs: string[] = [];
  const pushUnik = (c?: string) => {
    if (c && !seen.has(c)) { seen.add(c); allDocs.push(c); }
  };
  for (let i = 0; i < Math.max(kwDocs.length, vecDocs.length); i++) {
    pushUnik(kwDocs[i]);
    pushUnik(vecDocs[i]);
  }

  // Fallback keyword ke loose filter kalau strict Kategori kosong. Ditandai → inject caveat confidence.
  let usedLooseFallback = false;
  if (faultCode && allDocs.length === 0) {
    const fbPromises = normalizedQueries.map(sq =>
      supabase!.from('documents').select('content, metadata')
        .ilike('content', `%${escapeLike(sq)}%`)
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

  if (allDocs.length === 0) return { content: '', hasResults: false };

  // Fault code literal-contain filter (cegah false-positive dari vector). CRITICAL: cek juga stripped
  // variant — OCR baca "13006-02" tapi content simpan "13006-2" (leading-zero suffix).
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
    // Kalau embedding/vector gagal DAN keyword juga tidak ada hasil → RAG pipeline error
    const embedFailed = vectorSettled.status === 'rejected';
    if (embedFailed && allDocs.length === 0) {
      const reason = (vectorSettled.reason as Error)?.message ?? 'Embedding service error';
      return { content: '', hasResults: false, ragError: reason };
    }
    return { content: '', hasResults: false };
  }

  // Cap input rerank → bounded latency + bounded PAYLOAD.
  const rerankInput = capRerankPayload(filteredDocs);
  // Rerank pool lebih besar dari topN → MMR punya kandidat untuk dipilih beragam.
  const rerankPool = Math.min(rerankInput.length, Math.max(topN * 2, 8));
  const { docs: reranked, error: rerankErr } = await rerankWithCohere(primaryQuery, rerankInput, rerankPool);
  // MMR: topN relevan TAPI saling melengkapi (top[0] tetap relevansi tertinggi → confidence valid).
  const top = mmrSelect(reranked, topN, 0.7);
  const { confidence, topScore } = computeConfidence(top);

  console.info('[confidence] tm tier=%s topScore=%s pool=%d→%d (MMR)',
    confidence, topScore.toFixed(2), reranked.length, top.length);

  // Loose-filter fallback → downgrade confidence ke medium supaya AI inject caveat verifikasi
  const effectiveConfidence = usedLooseFallback && confidence === 'high' ? 'medium' : confidence;
  // Content di-join dgn separator --- saja (tanpa prefix [Rank N] — AI tak butuh nomor ranking).
  const content = top.map(t => t.content).join('\n\n---\n\n');
  return { content, hasResults: true, confidence: effectiveConfidence, topScore, ...(rerankErr ? { ragError: rerankErr } : {}) };
}

// Models yang punya ENGINE MANUAL di Supabase
// (Yanmar 4TNV88 untuk ZX48U-5A + ZX65USB-5A, engine lain untuk model lain)
const ENGINE_MANUAL_MODELS = new Set(['ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G']);

/** Search ENGINE MANUAL by P-code (2nd-pass setelah fault code TM) → DTC diagnosis procedure. */
export async function searchEngineManual(
  pCodes: string[],
  model: string,
  topN = 2,
): Promise<RAGResult> {
  if (!supabase || !ENGINE_MANUAL_MODELS.has(model) || pCodes.length === 0) {
    return { content: '', hasResults: false };
  }

  // Keyword-only — P-code muncul LITERAL di DTC chunk ("DTC P0340/4 ...") → tak butuh embed
  // (fault code path total = 1 embed). Rerank via Cohere.
  const filter = { Model: model, Kategori: 'ENGINE MANUAL' };
  const seen = new Set<string>();
  const allDocs: string[] = [];

  const kwSettled = await Promise.allSettled(
    pCodes.map(pCode =>
      supabase!.from('documents').select('content')
        .ilike('content', `%${escapeLike(pCode)}%`)
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

  // Pagar payload juga di sini. Sebelumnya allDocs TANPA batas ukuran sama sekali
  // (maks 3 P-code × 4 hasil = 12 chunk, tapi chunk bisa 27 rb char → bisa lewat 1 MB).
  const { docs: top, error: rerankErr } = await rerankWithCohere(pCodes[0], capRerankPayload(allDocs), topN);
  const { confidence, topScore } = computeConfidence(top);
  return {
    content: top.map(t => t.content).join('\n\n---\n\n'),  // strip [Rank N] prefix
    hasResults: top.length > 0,
    confidence,
    topScore,
    ...(rerankErr ? { ragError: rerankErr } : {}),
  };
}

// Active PROMO kategori — HANYA periode terbaru/aktif (period lama dihapus dari DB).
// Saat ganti periode: ingest yang baru → hapus period lama dari DB → update array ini,
// biar acuan harga selalu yang terkini (tak ada harga kadaluarsa yang ikut ke-retrieve).
const ACTIVE_PROMO_KATEGORI = ['PROMO Q2 FY2026'] as const;

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
 * Coverage: CPM (1 chunk per model, full schedule) + ACTIVE_PROMO_KATEGORI (Q2 FY2026)
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

  // Search CPM + promo aktif (Q2 FY2026) paralel.
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

  // PARTS CATALOG (always) + ENGINE PARTS (kalau ada). Counts dinaikkan — PROMO banyak section terpisah,
  // 3 chunk dulu miss section non-electrical utk 'harga bucket'.
  const bodyCount = (isEnginePN && hasEngineCatalog) ? 3 : 7;     // was 2/5
  const engineCount = isEnginePN ? 5 : 3;
  const promoCount = 5;                                           // was 3
  const cpmCount = 1;

  // Strip nama model dari query_text juga — cegah keyword terpolarisasi ke chunk yg literal mention model.
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

  // 2+. SEMUA periode PROMO aktif (Q4+Q1). Threshold lebih rendah utk capture section non-electrical.
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

  // Urutan konteks (invarian — jangan diubah):
  //   1. CPM selalu duluan (model paling perhatian ke awal prompt)
  //   2. exact_part_no match (PN literal ketemu persis — presisi mutlak)
  //   3. sisanya by relevance
  //
  // Query NAMA KOMPONEN (bukan PN literal) di-rerank Cohere + MMR — cosine pgvector lemah bedakan
  // section bertetangga ("seal kit swing" vs section seal kit lain). PN literal TIDAK di-rerank
  // (exact match sudah deterministik).
  const nonCpm = [...bodyData, ...engineData, ...promoData];
  nonCpm.sort((a, b) => {
    const aExact = a.match_type === 'exact_part_no' ? 1 : 0;
    const bExact = b.match_type === 'exact_part_no' ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });

  let orderedNonCpm = nonCpm;
  if (!partNum && nonCpm.length > 3) {
    const exact = nonCpm.filter(d => d.match_type === 'exact_part_no');
    const rest  = nonCpm.filter(d => d.match_type !== 'exact_part_no');
    if (rest.length > 3) {
      // Cap input rerank (rest sudah tersortir by similarity) → bounded latency + payload.
      // Pakai capRerankPayload, bukan slice(0, RERANK_INPUT_CAP): jalur ini ikut naik ke 45
      // saat konstanta itu dinaikkan, jadi butuh pagar ukuran yang sama.
      const rerankDocs = capRerankPayload(rest.map(d => d.content));
      const rerankRest = rest.slice(0, rerankDocs.length);
      const { docs: reranked, error } = await rerankWithCohere(
        queryText,
        rerankDocs,
        Math.min(rerankRest.length, 12),
      );
      if (!error && reranked.length > 0) {
        // MMR: hasil relevan tapi saling melengkapi (hindari 3 section nyaris kembar)
        const diverse = mmrSelect(reranked, Math.min(reranked.length, 10), 0.7);
        const byContent = new Map(rest.map(d => [d.content, d]));
        orderedNonCpm = [
          ...exact,
          ...diverse
            .map(r => byContent.get(r.content))
            .filter((d): d is HybridResult => !!d),
        ];
        console.info('[parts] rerank+MMR aktif: %d kandidat → %d', rest.length, diverse.length);
      }
    }
  }

  const merged = [...cpmData, ...orderedNonCpm];

  // Top 12 (naik dari 7) → lebih banyak section PROMO/PARTS terwakili (compression extract nanti).
  const top = merged.slice(0, 12);
  if (top.length === 0) return { content: '', hasResults: false };

  console.info('[parts] cpm=%d body=%d engine=%d promo=%d (Q4+Q1) → top=%d',
    cpmData.length, bodyData.length, engineData.length, promoData.length, top.length);

  return {
    content: top.map(d => d.content).join('\n\n---\n\n'),
    hasResults: true,
  };
}
