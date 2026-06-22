import { SYSTEM_PROMPT } from '../constants';
import { UnitModel, Message } from '../types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, getAuthToken, isPartsQuery, extractPartNumber, searchPartsCatalog, searchServiceIntervalParts, stripModelFromQuery, MODELS_WITHOUT_PARTS_CATALOG } from './supabase';

const PROXY_URL    = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');
export const MODEL        = import.meta.env.VITE_VERTEX_MODEL || 'gemini-3.5-flash';
export const INTENT_MODEL = 'gemini-3.1-flash-lite';

interface TextPart            { text: string }
interface InlineDataPart      { inlineData: { mimeType: string; data: string } }
interface FunctionCallPart    { functionCall: { name: string; args: Record<string, unknown> } }
interface FunctionResponsePart { functionResponse: { name: string; response: Record<string, unknown> } }

export type Part = TextPart | InlineDataPart | FunctionCallPart | FunctionResponsePart;

export interface VContent { role: 'user' | 'model'; parts: Part[] }

// Gemini function calling — JSON schema subset (type, properties, required, items)
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required?: string[];
  };
}

export interface VRequest {
  contents: VContent[];
  systemInstruction?: { parts: TextPart[] };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    thinkingConfig?: { thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' };
  };
  tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE' } };
}

export interface VResponse {
  candidates: Array<{
    content: { role: string; parts: Part[] };
    finishReason: string;
  }>;
}

interface IntentAnalysis {
  shouldSearch: boolean;
  searchType: 'technical' | 'parts' | 'general' | 'off_topic';
  optimizedQuery: string;
}

// Callback progress event (thinking/tool_call/tool_result) — dipakai single-pass juga
// agar UI tetap menampilkan indikator "Menganalisa query… / Mencari di …" seperti agentic.
type AgentEventEmit = (event: import('./react-agent').AgentEvent) => void;

function fileToInlineData(file: File): Promise<InlineDataPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result bisa null jika file kosong atau read gagal sebelum onloadend
      const result = reader.result;
      if (typeof result !== 'string') { reject(new Error('FileReader result bukan string')); return; }
      const [, base64] = result.split(',');
      if (!base64) { reject(new Error('Invalid data URL — missing base64 payload')); return; }
      resolve({ inlineData: { mimeType: file.type, data: base64 } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Fetch dengan hard timeout — mencegah hang forever pada koneksi buruk */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error(`Request timeout ${ms}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function callProxy(body: VRequest, enableGoogleSearch = false, modelOverride?: string): Promise<VResponse> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetchWithTimeout(`${PROXY_URL}/v1/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: modelOverride ?? MODEL, enableGoogleSearch, ...body }),
  }, 30_000);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vertex AI error ${res.status}: ${err}`);
  }
  return res.json() as Promise<VResponse>;
}

export function getText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => 'text' in p && !('thought' in p))
    .map(p => p.text)
    .join('');
}

/**
 * Bersihkan optimizedQuery hasil AI:
 * - Hapus kata duplikat (swing…swing, kg…kg, weight…mass dianggap sama via map)
 * - Max 10 kata (safety cap) — cukup untuk query paling kompleks, cegah dump verbose
 * Deterministic, tidak butuh AI tambahan.
 */
function cleanOptimizedQuery(query: string): string {
  if (!query.trim()) return query;

  // Normalisasi synonym teknis umum ke bentuk canonical supaya dedup lebih akurat
  // Synonym → canonical untuk dedup. JANGAN map unit (kg, MPa, rpm) ke kata lain
  // karena teknisi sering query spesifik unit → kehilangan unit = query rusak.
  const SYNONYMS: Record<string, string> = {
    mass: 'weight', berat: 'weight',
    spec: 'specification', specs: 'specification',
    assy: 'assembly', asm: 'assembly',
    press: 'pressure', tekanan: 'pressure',
    vol: 'volume', cap: 'capacity', kapasitas: 'capacity',
  };
  // Kata filler yang sering di-pad AI tapi tidak ada di manual teknis
  // 'specification' dikeluarkan dari STOPWORDS — ada di SYNONYMS sebagai canonical dari spec/specs.
  // Filter 'specification' di sini justru buang kata penting di query teknis ("hydraulic specification").
  const STOPWORDS = new Set(['the', 'and', 'for', 'of', 'in', 'on', 'at', 'with',
    'information', 'data', 'detail', 'value']);

  const words = query.trim().split(/\s+/);
  const seen = new Set<string>();
  const clean: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    const canonical = SYNONYMS[lower] ?? lower;
    if (lower.length < 2 || seen.has(canonical) || STOPWORDS.has(lower)) continue;
    seen.add(canonical);
    clean.push(word);
    if (clean.length >= 10) break; // safety cap — AI sudah jaga panjang, ini hanya emergency stop
  }

  return clean.join(' ');
}

async function analyzeIntent(
  userInput: string,
  history: Message[],
  _model: UnitModel,  // reserved — akan dipakai kalau ada prompt variasi per model
): Promise<IntentAnalysis> {
  const ctx = history.slice(-3)
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 150)}`)
    .join('\n');

  const systemPrompt = `You are a query classifier and optimizer for Hitachi/KCM heavy equipment documentation search.
Output ONLY valid JSON — no markdown, no preamble, no explanation.

═══ STEP 1: CLASSIFY searchType ═══

"parts"    → Part numbers, spare parts lookup, cross-reference, compatibility, service interval parts (CPM),
             maintenance schedule per X jam/hm, promo harga parts.
             RULE: ANY query mentioning interval (500/1000/2000 jam/hm/hr) → "parts".
             optimizedQuery MUST be ≥3 words. Interval pattern: "X hour service maintenance parts".

"technical" → Diagnosis, troubleshooting, fault codes, specs (torque/pressure/displacement/clearance),
              procedures (teardown/assembly), oil/fuel/coolant capacity, electrical circuit,
              hydraulic flow, operating procedure.
              NOTE: "harga promo" / "promo Q4" without interval → "parts". With procedure context → "technical".

"general"  → Greetings, acknowledgments, short casual chat directly related to the work context ("halo", "oke", "thanks", "lanjut", "siap", "mantap").
"off_topic" → Questions completely unrelated to heavy equipment, engineering, or technician work context. Examples: recipes, sports, general internet questions, news, weather, cooking, entertainment. Return shouldSearch=false.

═══ STEP 2: BUILD optimizedQuery (parts/technical only) ═══

Rules (apply in order):
1. EXTRACT core intent: component + attribute/symptom/action
2. TRANSLATE Indonesian → English technical terms from Hitachi service manuals
3. STRIP: kenapa/berapa/bagaimana/apa/gimana/cara/coba/tolong/mohon/kok/sih/ya/dong + articles
4. INFER pronouns (itu/ini/nya) → component name from conversation context. NEVER infer model names.
5. NO PADDING: translate exactly what user said. "swing motor" ≠ "swing motor assembly"
6. NO MODEL NAME: never add ZX48U-5A / ZX200-5G / KCM 60ZV etc.
7. UNIT: include only if user explicitly stated it. "berapa berat" → weight (no kg). "berapa kg" → add kg.
8. LENGTH proportional to complexity:
   - Simple spec: 2-3 words  → "swing motor weight", "main pump displacement"
   - Symptom+component: 3-4  → "hydraulic pump no suction", "swing motor slow"
   - Procedure/multi-factor: 5-7 → "engine no start after fuel filter replacement"
   - NEVER pad short queries. NEVER truncate complex queries.

═══ EXAMPLES ═══

Technical — specs & symptoms:
"berapa berat swing motor"                    → technical, "swing motor weight"
"kapasitas oli engine"                        → technical, "engine oil capacity"
"tekanan main pump MPa"                       → technical, "main pump pressure MPa"
"swing lambat kenapa"                         → technical, "swing motor slow response"
"kenapa pompanya nggak mau narik"             → technical, "hydraulic pump no suction"
"berapa torque baut head cylinder"            → technical, "cylinder head bolt torque"
"cara adjust relief valve main pump"          → technical, "main pump relief valve adjustment"
"engine tidak mau hidup setelah ganti filter" → technical, "engine no start after fuel filter replacement"
"tekanan hydraulic turun saat boom diangkat"  → technical, "hydraulic pressure drop boom lift"
"masih bocor juga tuh" [ctx: hydraulic cyl]  → technical, "hydraulic cylinder leak"

Parts — PN, catalog, promo:
"PN YB60000068 itu apa"           → parts, "YB60000068"
"harga seal kit swing motor"      → parts, "swing motor seal kit price"
"ada promo filter hydraulic ngga" → parts, "hydraulic filter promo Q4 FY2025"
"harga promo seal kit swing"      → parts, "swing motor seal kit promo price"
"reman pump berapa harganya"      → parts, "pump reman price Q4 FY2025"

Parts — service interval (ALWAYS "parts", ALWAYS ≥3 words with "hour maintenance parts"):
"jadwal CPM 500 jam"              → parts, "500 hour maintenance parts"
"parts yang diganti 1000 jam"     → parts, "1000 hour service maintenance parts"
"part number 2000 hm"             → parts, "2000 hour service maintenance parts"
"service 500 jam dengan promo"    → parts, "500 hour maintenance parts promo"

General:
"halo mas"  → general, ""
"oke siap"  → general, ""
"thanks"    → general, ""

Off-topic (redirect, do NOT answer) — culinary, sports, politics, news, weather, entertainment, general trivia:
"cara bikin sate padang"  → off_topic, ""
"resep nasi goreng"       → off_topic, ""
"cara masak rendang"      → off_topic, ""
"siapa presiden sekarang" → off_topic, ""
"hasil bola tadi malam"   → off_topic, ""
"cuaca besok gimana"      → off_topic, ""
"rekomendasi film bagus"  → off_topic, ""

═══ OUTPUT FORMAT (STRICT) ═══
Single-line JSON only. Exactly 3 fields. No extra fields, no arrays, no nested objects.
{"shouldSearch":<bool>,"searchType":"technical"|"parts"|"general"|"off_topic","optimizedQuery":"<2-10 words>"}
shouldSearch=false → searchType="general" or "off_topic", optimizedQuery=""`;

  const prompt = `${ctx ? `Conversation context:\n${ctx}\n\n` : ''}Technician query: "${userInput}"

Output ONLY this JSON shape (single line, no other text):
{"shouldSearch":<bool>,"searchType":"technical"|"parts"|"general","optimizedQuery":"<2-10 word English phrase>"}

shouldSearch=true: technical/parts queries → optimizedQuery filled.
shouldSearch=false: greetings, acknowledgments, casual → optimizedQuery="".`;

  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const raw = getText(res.candidates[0]?.content?.parts ?? []).trim();
    // Cari JSON object pertama — toleran terhadap text bocor sebelum/sesudah JSON
    const jsonStart = raw.indexOf('{');
    const jsonEnd   = raw.lastIndexOf('}');
    const jsonStr   = jsonStart !== -1 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : '';
    if (!jsonStr) throw new Error('No JSON in INTENT_MODEL output');
    const parsed = JSON.parse(jsonStr) as IntentAnalysis;
    const validTypes = ['technical', 'parts', 'general', 'off_topic'] as const;
    const searchType = validTypes.includes(parsed.searchType) ? parsed.searchType : 'technical';
    const rawQuery = parsed.optimizedQuery?.trim() || userInput;
    return {
      shouldSearch: Boolean(parsed.shouldSearch),
      searchType,
      optimizedQuery: cleanOptimizedQuery(rawQuery),
    };
  } catch (err) {
    console.warn('[analyzeIntent] failed, fallback to raw input:', (err as Error)?.message);
    return { shouldSearch: true, searchType: 'technical', optimizedQuery: userInput };
  }
}

function historyToContents(history: Message[], window = 20): VContent[] {
  return history.slice(-window)
    .filter(m => m.content?.trim())
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }] as Part[],
    }));
}

async function extractFaultCodes(imageParts: InlineDataPart[]): Promise<string[]> {
  // Pakai INTENT_MODEL (gemini-3.1-flash-lite-preview) bukan main MODEL.
  // gemini-3-flash-preview punya thinking mode aktif by default — makan 284-285
  // thinking tokens dari budget, leaving ~12 token output → MAX_TOKENS truncate.
  // flash-lite tidak punya thinking → full budget output.
  const SYS_PROMPT = `OCR fault code specialist untuk Hitachi/KCM heavy equipment monitor display.
Format output: 1 baris, comma-separated codes, atau "NONE".

Rules:
- Include letter prefix kalau visible (ENG:, W:, CA, dll). Contoh: "ENG:00436-04, W:1208, CA2769"
- Suffix \`-XX\` di-include kalau visible (mis. \`13006-02\`)
- Tidak ada kode visible → "NONE"
- Duplikat kode di image → list sekali saja
- Ragu/tidak yakin baca → SKIP kode itu (better miss daripada salah baca)
- Bukan fault code (mis. operating hour, tanggal, time) → JANGAN include`;

  const res = await callProxy({
    contents: [{
      role: 'user',
      parts: [
        ...imageParts,
        { text: 'Extract semua fault code dari image ini. Format: comma-separated atau NONE.' },
      ],
    }],
    systemInstruction: { parts: [{ text: SYS_PROMPT }] },
    generationConfig: { maxOutputTokens: 150, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
  }, false, INTENT_MODEL);

  const raw = getText(res.candidates[0]?.content?.parts ?? []).trim();
  if (!raw || raw.toUpperCase() === 'NONE') return [];
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

export async function callProxyStream(
  body: VRequest,
  onChunk: (text: string) => void,
  enableGoogleSearch = false,
): Promise<string> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetchWithTimeout(`${PROXY_URL}/v1/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: MODEL, enableGoogleSearch, ...body }),
  }, 60_000);
  if (!res.ok) throw new Error(`Stream error ${res.status}`);
  if (!res.body) throw new Error('Stream response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const json = JSON.parse(jsonStr);
        const text = getText(json.candidates?.[0]?.content?.parts ?? []);
        if (text) { fullText += text; onChunk(text); }
      } catch { /* ignore malformed chunk */ }
    }
  }
  return fullText;
}

/**
 * Contextual Compression — extract HANYA baris/kalimat yg langsung relevan
 * dengan query dari setiap chunk, pakai INTENT_MODEL (flash-lite, no thinking).
 * Run paralel via Promise.allSettled — N chunks jadi 1 RTT sekitar 500ms.
 *
 * Apply selektif (lihat caller): hanya untuk natural-language technical path.
 * Skip untuk fault code (full content matters) & parts (PN list integrity).
 *
 * Fallback per-chunk:
 * - Chunk < 500 chars: skip compress (sudah compact)
 * - Compress fail: return original
 * - Result < 30 chars: return original (over-stripped, tidak useful)
 */
async function compressChunks(chunks: string[], userQuery: string): Promise<string[]> {
  // Extraction balance — drop narrative bloat tapi PRESERVE enough context
  // untuk AI bisa frame agentic response (section name, related notes, dll).
  // Terlalu aggressive compress (cuma raw data row) bikin AI sound monoton.
  const SYS = 'Ekstraktor presisi dokumen teknis Hitachi. Aturan:\n- Quote VERBATIM (tidak paraphrase).\n- Ambil baris yg jawab QUERY + 1-2 baris context terkait (mis. section name, service code note, related component) supaya jawaban kontekstual bukan raw data dump.\n- Pertahankan format: backtick PN/spec, tabel row utuh.\n- Drop: image caption, page reference, doc footer.\n- Tidak ada relevan → return string kosong.';

  // Cap chunk yg dikirim ke INTENT_MODEL — context window flash-lite ~8K input.
  const MAX_CHUNK_FOR_COMPRESS = 8000;

  const buildPrompt = (chunk: string) => {
    const safeChunk = chunk.length > MAX_CHUNK_FOR_COMPRESS
      ? chunk.slice(0, MAX_CHUNK_FOR_COMPRESS) + '\n[...truncated]'
      : chunk;
    return `QUERY: "${userQuery}"\n\nCHUNK:\n${safeChunk}\n\nOUTPUT (max 150 kata, verbatim excerpts + minimal context, no preamble):`;
  };

  const compressOne = async (chunk: string): Promise<string> => {
    if (chunk.length < 500) return chunk; // skip small — sudah compact
    try {
      const res = await callProxy({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(chunk) }] }],
        systemInstruction: { parts: [{ text: SYS }] },
        generationConfig: { maxOutputTokens: 350, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
      }, false, INTENT_MODEL);
      const compressed = getText(res.candidates[0]?.content?.parts ?? []).trim();
      if (compressed.length < 30) return chunk; // over-stripped, fallback ke original
      return compressed;
    } catch (err) {
      console.warn('[compressChunks] failed for one chunk, fallback to original:', (err as Error)?.message);
      return chunk;
    }
  };

  const results = await Promise.allSettled(chunks.map(compressOne));
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : chunks[i]);
}

/**
 * Extract P-codes hanya dari baris yang mengandung salah satu search term.
 * Mencegah extract SEMUA P-code dari chunk panjang (mis. Engine Fault Code
 * List punya 30+ P-code) yang akan menyebabkan 30+ embed calls di searchEngineManual.
 * Limit ke 3 P-codes teratas untuk efisiensi.
 */
function extractRelatedPCodes(content: string, searchTerms: string[]): string[] {
  const lines = content.split('\n');
  const pCodes: string[] = [];
  // P-code variant: P1234 (standard) atau P1234-04 (DTC subcode suffix Yanmar/Isuzu).
  // Capture base P-code (P\d{4}) — suffix di-strip karena searchEngineManual
  // ilike '%P0340%' akan match baris yang punya 'P0340/4' atau 'P0340-04' juga.
  const P_CODE_RE = /\bP\d{4}\b/gi;
  for (const line of lines) {
    const lineUpper = line.toUpperCase();
    const isRelevant = searchTerms.some(t => t.length >= 4 && lineUpper.includes(t.toUpperCase()));
    if (isRelevant) {
      const matches = [...line.matchAll(P_CODE_RE)].map(m => m[0].toUpperCase());
      pCodes.push(...matches);
    }
  }
  // Dedup + cap. Max 3 → max 3 embed calls di searchEngineManual.
  return [...new Set(pCodes)].slice(0, 3);
}

// Canned templates untuk "data not found" cases — bypass AI total supaya
// guaranteed correct text, no halu, no roundtrip ke Vertex.
// User adalah tim Hexindo (dealer) — JANGAN suruh "konsultasi dealer Hexindo".
// Singkatan teknis (MPDr, TM, WM, TA) tidak di-expand — teknisi sudah tahu.
function ragErrorTemplate(errorMsg: string): string {
  const isTimeout = errorMsg.toLowerCase().includes('timeout');
  const isRerank  = errorMsg.toLowerCase().includes('rerank');
  if (isRerank && isTimeout) {
    // Rerank timeout: hasil masih ada (vector order), tapi ranking tidak optimal
    // Tidak perlu block — cukup warning di console, lanjut normal
    return '';
  }
  // Embedding / Supabase error: tidak ada data → jangan jawab
  return `Sistem pencarian data sedang mengalami gangguan sementara. Jawaban ditahan dulu untuk menghindari informasi yang keliru.\n\nCoba kirim ulang pertanyaanmu dalam beberapa saat.`;
}

function faultCodeNotFoundTemplate(faultQuery: string, model: string): string {
  return `Kode \`${faultQuery}\` tidak ada di database manual **${model}** yang saya akses.

Pastikan:
- Pembacaan kode benar
- Model unit sesuai (saat ini di-set ke ${model})`;
}

function partsNotFoundTemplate(query: string, model: string): string {
  return `Parts untuk **${query}** tidak ada di katalog **${model}** yang saya akses.

Coba:
- Cek Parts Catalog fisik
- Konfirmasi ke referensi internal dengan menyebut model unit + komponen.`;
}

// Adaptive retrieval — saat semua chunk score-nya rendah (<0.3), bypass AI
// karena risiko halu terlalu tinggi. User dapat saran refine query, bukan
// jawaban yang "kelihatan benar tapi sebenarnya meleset".
function lowConfidenceTemplate(query: string, model: string): string {
  return `Saya belum menemukan data yang cukup spesifik untuk **"${query}"** di manual ${model}.

Biar hasilnya akurat, coba:
- Sebut nama komponen lebih spesifik (mis. \`swing motor relief pressure\`, bukan \`tekanan swing\`)
- Pastikan model unit sudah benar
- Kalau urgent, eskalasi ke Technical Support Department`;
}

function offTopicTemplate(): string {
  return `Saya dirancang khusus untuk diagnosis dan technical support alat berat Hitachi/KCM — fault code, parts lookup, hydraulic spec, troubleshooting.

Pertanyaan di luar itu di luar scope saya. Ada yang mau dicek di unit?`;
}

// Regex fault code: WAJIB ada digit. [0-9A-F]{2,6} dengan /i match a-f letters
// → "blade","cafe","dead" dianggap fault code (false positive).
// Letter-prefix TANPA dash WAJIB ≥4 digit — kalau tidak, fuel grade "B50"/"B30"/"B100"
// (biodiesel blend) & shorthand pendek ke-detect sebagai fault code → misroute ke TM
// search → canned "kode tidak ada". Real code: CA2769/W:1208 (≥4 digit) atau punya
// dash suffix (ENG:00436-04, 11006-2). Pure-digit tetap boleh 3-6 digit (16606).
// Di-hoist ke module level — tidak di-compile ulang setiap generateResponseStream call.
const FAULT_CODE_PATTERN = /(?:[A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}(?:-[0-9A-F]{1,4})?)/i;

// ─── Konstanta ────────────────────────────────────────────────────────────────

const RAG_LABEL = {
  manual: 'DATA MANUAL TERSEDIA',
  parts:  'DATA PARTS CATALOG TERSEDIA',
} as const;

const FALLBACK_RESPONSE = 'Maaf, sistem tidak bisa memproses permintaan ini.';

// ─── Tipe routing ──────────────────────────────────────────────────────────────

/** Discriminated union — hasil routing RAG sebelum AI dipanggil */
type RagRouteResult =
  | { type: 'rag_found';  content: string; dataLabel: string; confidence?: 'high' | 'medium' | 'low' }
  | { type: 'rag_canned'; text: string }   // bypass AI, kirim teks ini langsung
  | { type: 'google_search' };             // tidak ada RAG, fallback Google

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Stream canned text via onChunk — feel natural seperti AI streaming */
function streamCanned(text: string, onChunk: (text: string) => void): string {
  const CHUNK_SIZE = 80;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    onChunk(text.slice(i, i + CHUNK_SIZE));
  }
  return text;
}

/** Deteksi fault code di input: regex exact-match atau embedded dalam kalimat.
 *  Untuk EMBEDDED: pure digit (tanpa letter prefix/dash suffix) DITOLAK karena
 *  bisa false-positive dengan service interval ("service 2000 jam" → "2000"
 *  bukan fault code, itu interval). Pure digit hanya valid kalau FULL match. */
// Letter-prefix tanpa dash WAJIB ≥4 digit (lihat FAULT_CODE_PATTERN) — cegah "BBM B50"
// di tengah kalimat ke-detect sebagai fault code. Pure-digit embedded tetap wajib dash.
const EMBEDDED_FAULT_CODE_RE = /\b([A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}-[0-9A-F]{1,4})\b/i;

function detectFaultCodeInQuery(trimmed: string): { isFaultCode: boolean; faultQuery: string } {
  const looksLike    = new RegExp(`^${FAULT_CODE_PATTERN.source}$`, 'i').test(trimmed);
  const embeddedCode = !looksLike
    ? trimmed.match(EMBEDDED_FAULT_CODE_RE)?.[1]?.trim()
    : undefined;
  return { isFaultCode: looksLike || !!embeddedCode, faultQuery: embeddedCode ?? trimmed };
}

/**
 * 2nd-pass: enrichment dari ENGINE MANUAL via P-codes yang diekstrak dari TM result.
 * P-codes diambil HANYA dari baris yang mengandung fault code — mencegah 30+ embed
 * calls dari chunk Engine Fault Code List yang bisa punya puluhan P-code sekaligus.
 * Kegagalan Engine Manual bersifat non-fatal: konten TM tetap dikembalikan.
 */
async function augmentWithEngineManual(
  tmContent: string,
  faultQuery: string,
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<string> {
  const pCodes = extractRelatedPCodes(tmContent, extractSearchTerms(faultQuery));
  if (pCodes.length === 0) return tmContent;
  emit({ type: 'tool_call', tool: 'search_engine_manual' });
  try {
    const emResult = await searchEngineManual(pCodes, model);
    emit({ type: 'tool_result', tool: 'search_engine_manual', found: emResult.hasResults });
    return emResult.hasResults
      ? `${tmContent}\n\n---\n\n[ENGINE MANUAL]\n${emResult.content}`
      : tmContent;
  } catch (err) {
    console.warn('[augmentWithEngineManual] 2nd-pass skipped:', err instanceof Error ? err.message : String(err));
    return tmContent;
  }
}

// ─── Routing resolvers (masing-masing < 25 baris) ────────────────────────────

async function resolveFaultCodeQuery(
  faultQuery: string,
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  emit({ type: 'tool_call', tool: 'search_technical_manual' });
  const ragResult = await searchTechnicalManualMulti(extractSearchTerms(faultQuery), model);
  emit({ type: 'tool_result', tool: 'search_technical_manual', found: ragResult.hasResults });

  if (ragResult.ragError) {
    const errMsg = ragErrorTemplate(ragResult.ragError);
    if (errMsg) return { type: 'rag_canned', text: errMsg };
  }

  if (!ragResult.hasResults) {
    return { type: 'rag_canned', text: faultCodeNotFoundTemplate(faultQuery, model) };
  }

  const augmented = await augmentWithEngineManual(ragResult.content, faultQuery, model, emit);
  return { type: 'rag_found', content: augmented, dataLabel: RAG_LABEL.manual };
}

// Pattern: "service 2000 jam/hm/hr" — deteksi di code agar tidak bergantung
// pada INTENT_MODEL yang rentan strip angka interval menjadi "2000" saja.
const SERVICE_INTERVAL_RE = /\b(\d{3,5})\s*(?:jam|hm|h(?:our)?r?|hours?)\b/i;

/**
 * Parse tabel CPM dan ekstrak parts yang diganti di interval tertentu.
 * Solusi untuk RINGKASAN yang terpotong "..." di CPM chunk — alih-alih
 * mengandalkan RINGKASAN, baca langsung dari tabel utama yang selalu lengkap.
 * Mengembalikan list bersih yang diprepend ke RAG content agar model tidak
 * perlu "interpretasi" tabel → drastis kurangi hallucination PN.
 */
function extractCpmPartsForInterval(content: string, hours: number): string {
  const lines = content.split('\n');

  // Cari header line yang berisi kolom interval
  const headerLine = lines.find(l => /\b500hr\b/.test(l) && /\b1000hr\b/.test(l));
  if (!headerLine) return '';

  // Tentukan urutan interval dari header
  const intervals = Array.from(headerLine.matchAll(/(\d+)hr/g), m => parseInt(m[1]));
  const colIdx = intervals.indexOf(hours);
  if (colIdx < 0) return '';

  const parts: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // Split by 2+ whitespace: [no, description, partNumber, "v1 v2 v3..."]
    const fields = line.trim().split(/\s{2,}/);
    if (fields.length < 4) continue;
    const no = fields[0];
    if (!/^\d+$/.test(no)) continue; // bukan baris data

    const desc = fields[1];
    const pn   = fields[2];
    const vals = fields[3].trim().split(/\s+/);
    const qty  = vals[colIdx];
    if (!qty || qty === '-') continue;

    parts.push(`${pn} | ${desc} | qty:${qty}`);
  }

  return parts.join('\n');
}

async function resolvePartsQuery(
  trimmed: string,
  history: Message[],
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  const hasLiteralPN = !!extractPartNumber(trimmed);
  const isLongQuery  = trimmed.split(/\s+/).length >= 4;
  let searchQuery    = trimmed;

  // Fast-path: deteksi service interval pattern (mis. "service 2000 jam", "2000 hm")
  // Bangun embed query langsung — bypass analyzeIntent yang sering return "2000" saja.
  const intervalMatch = !hasLiteralPN && trimmed.match(SERVICE_INTERVAL_RE);
  if (intervalMatch) {
    searchQuery = `${intervalMatch[1]} hour service maintenance schedule parts`;
  } else if (!hasLiteralPN && isLongQuery) {
    const intent = await analyzeIntent(trimmed, history, model);
    const optWords = intent.optimizedQuery?.trim().split(/\s+/).length ?? 0;
    if (intent.optimizedQuery && intent.optimizedQuery !== trimmed && optWords >= 3) {
      searchQuery = intent.optimizedQuery;
    }
  }

  // Service interval queries: pakai fungsi terpisah yang HANYA search CPM + PROMO.
  // Tidak include PARTS CATALOG (ratusan PN tak relevan = source hallucination).
  // Hemat 2 RPC calls juga (skip body + engine catalog search).
  emit({ type: 'tool_call', tool: 'search_parts_catalog' });
  const ragResult = intervalMatch
    ? await searchServiceIntervalParts(searchQuery, model)
    : await searchPartsCatalog(searchQuery, model);
  emit({ type: 'tool_result', tool: 'search_parts_catalog', found: ragResult.hasResults });

  if (!ragResult.hasResults) {
    // Smart fallback: model belum punya PARTS CATALOG (ZX65USB-5A, ZX138MF-5G) →
    // coba Workshop Manual yg sering inline-mention PN. Bukan canned template,
    // beri user info partial daripada zero info.
    if (MODELS_WITHOUT_PARTS_CATALOG.has(model)) {
      const wmResult = await searchTechnicalManualMulti([trimmed], model, 3, 'WORKSHOP MANUAL');
      if (wmResult.hasResults) {
        const note = `[CATATAN: Parts Catalog ${model} belum ter-ingest di knowledge base. Info di bawah dari Workshop Manual — PN mungkin disebut inline tapi tidak terstruktur. Verifikasi ke catalog fisik.]\n\n`;
        return { type: 'rag_found', content: note + wmResult.content, dataLabel: RAG_LABEL.parts, confidence: wmResult.confidence };
      }
    }
    return { type: 'rag_canned', text: partsNotFoundTemplate(trimmed, model) };
  }

  let finalContent = ragResult.content;
  if (intervalMatch) {
    const hours    = parseInt(intervalMatch[1]);
    const partsList = extractCpmPartsForInterval(ragResult.content, hours);
    if (partsList) {
      // Bangun konten terstruktur: extracted CPM list + PROMO chunks.
      // Raw CPM table tidak dimasukkan — model langsung lihat list bersih.
      // Ambil semua chunk PROMO dari kedua periode aktif (Q4 + Q1) — bukan CPM
      const promoChunks = ragResult.content
        .split(/\n\n---\n\n/)
        .filter(c => /Kategori:\s*PROMO/i.test(c));

      const cpmHeader = `⚠️ PARTS WAJIB GANTI ${hours} JAM (CPM resmi Hitachi):\n${partsList}\n\nGunakan PERSIS PN di atas. JANGAN substitusi dengan PN lain dari training.`;

      finalContent = promoChunks.length > 0
        ? `${cpmHeader}\n\n--- DATA PROMO AKTIF (untuk lookup harga PN di atas) ---\n\n${promoChunks.join('\n\n---\n\n')}`
        : cpmHeader;
    }
  }

  return { type: 'rag_found', content: finalContent, dataLabel: RAG_LABEL.parts };
}

async function resolveNaturalLanguageQuery(
  trimmed: string,
  history: Message[],
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  const intent = await analyzeIntent(trimmed, history, model);
  if (intent.searchType === 'off_topic') return { type: 'rag_canned', text: offTopicTemplate() };
  if (!intent.shouldSearch) return { type: 'google_search' };

  if (intent.searchType === 'parts') {
    // Guard: jangan pakai optimizedQuery < 3 kata (mis. "2000" untuk "service 2000 jam")
    // → embed query tidak bermakna → hasil acak → halu. Sama seperti guard di resolvePartsQuery.
    const optWords = intent.optimizedQuery?.trim().split(/\s+/).length ?? 0;
    const useOpt   = optWords >= 3;
    const searchQ  = useOpt ? intent.optimizedQuery : trimmed;
    emit({ type: 'tool_call', tool: 'search_parts_catalog' });
    const ragResult = await searchPartsCatalog(searchQ, model, useOpt);
    emit({ type: 'tool_result', tool: 'search_parts_catalog', found: ragResult.hasResults });
    return ragResult.hasResults
      ? { type: 'rag_found', content: ragResult.content, dataLabel: RAG_LABEL.parts }
      : { type: 'rag_canned', text: partsNotFoundTemplate(trimmed, model) };
  }

  // Technical: guard juga untuk query pendek
  const rawOpt = intent.optimizedQuery?.trim() ?? '';
  const query  = stripModelFromQuery(rawOpt.split(/\s+/).length >= 2 ? rawOpt : trimmed);
  emit({ type: 'tool_call', tool: 'search_technical_manual' });
  const ragResult = await searchTechnicalManualMulti([query], model);
  emit({ type: 'tool_result', tool: 'search_technical_manual', found: ragResult.hasResults });

  if (ragResult.ragError) {
    const errMsg = ragErrorTemplate(ragResult.ragError);
    if (errMsg) return { type: 'rag_canned', text: errMsg };
  }

  if (!ragResult.hasResults) return { type: 'google_search' };

  // Adaptive retrieval — chunk score semua rendah → bypass, no halu.
  // Hanya apply ke natural-language technical path. Fault code path tidak
  // dicek confidence karena literal-contain filter sudah precision check.
  if (ragResult.confidence === 'low') {
    return { type: 'rag_canned', text: lowConfidenceTemplate(trimmed, model) };
  }

  // Contextual Compression — extract baris relevan saja dari setiap chunk.
  // Drastis kurangi token input + AI tidak distracted oleh noise.
  // TAPI: compression adalah serial step (~0.5-1s) SEBELUM first token streaming —
  // jadi langsung terasa sebagai latency oleh user. gemini-3.5-flash handle context
  // sedang tanpa masalah, jadi skip lebih agresif untuk respon lebih cepat.
  // Skip untuk:
  //   - HIGH confidence: chunks sudah top-relevant (Cohere score >0.45) — compress = noise + overhead unjustified
  //   - Total content < 3500 chars: top-3 reranked chunk biasanya muat — compress = latency tanpa benefit nyata
  const totalBefore = ragResult.content.length;
  const skipCompress = ragResult.confidence === 'high' || totalBefore < 3500;

  if (skipCompress) {
    console.info('[compress] skip (confidence=%s totalChars=%d)', ragResult.confidence, totalBefore);
    return {
      type: 'rag_found',
      content: ragResult.content,
      dataLabel: RAG_LABEL.manual,
      confidence: ragResult.confidence,
    };
  }

  const chunks = ragResult.content.split('\n\n---\n\n');
  const compressed = await compressChunks(chunks, trimmed);
  const finalContent = compressed.filter(c => c.trim()).join('\n\n---\n\n');

  const reduction = totalBefore > 0 ? Math.round((1 - finalContent.length / totalBefore) * 100) : 0;
  console.info('[compress] chunks=%d %d→%d chars (%d%% reduction)',
    chunks.length, totalBefore, finalContent.length, reduction);

  return {
    type: 'rag_found',
    content: finalContent || ragResult.content,
    dataLabel: RAG_LABEL.manual,
    confidence: ragResult.confidence,
  };
}

// ─── Multi-aspek (2+ pertanyaan dalam 1 query) ───────────────────────────────
// Insight: kalau user PISAH pertanyaannya, retrieval optimal. Jadi tiru itu —
// pecah query jadi sub-query English (1 INTENT call), cari tiap aspek di TM + Parts
// paralel, gabung. Deterministik, BUKAN ReAct loop (yang rapuh/lambat/400-prone).

const MULTI_CONNECTOR_RE = /\b(?:dan|plus|sambil|bersamaan|juga|sekaligus|lalu|kemudian|serta)\b|[+&]/i;
const MULTI_TECH_RE = /\b(?:berat|weight|diameter|dia|panjang|length|lebar|width|tinggi|height|tebal|thickness|ukuran|size|tekanan|pressure|torque|torsi|clearance|displacement|capacity|kapasitas|rpm|spec|stroke|bore|pn|part\s*number|partnumber|harga|price|promo|motor|pump|valve|cylinder|silinder|filter|seal|gasket|bearing|rotor|stator|pin|bushing|shaft|swing|boom|arm|bucket|blade|track|engine|mesin|hydraulic|hidrolik|sensor|relay|solenoid|controller|alternator|starter|nozzle|injector|turbo|radiator|coupling|reduction|gear)\b/i;

function isMultiAspectQuery(q: string): boolean {
  if (!MULTI_CONNECTOR_RE.test(q)) return false;
  if (q.split(/\s+/).filter(Boolean).length < 5) return false;
  return MULTI_TECH_RE.test(q);
}

// Pecah query → array sub-query English (1 komponen+atribut tiap item). Max 4.
async function decomposeAspects(query: string): Promise<string[]> {
  const SYS = `Break a heavy-equipment query into independent English sub-queries — ONE component+attribute each. Translate Indonesian → English technical terms. NO model names. Output ONLY a JSON array of strings (max 4), no markdown, no preamble.
Examples:
"berat swing motor dan partnumber rotor" -> ["swing motor weight","rotor part number"]
"diameter pin bucket dan part numbernya" -> ["bucket pin diameter","bucket pin part number"]
"harga seal kit swing dan o-ring" -> ["swing motor seal kit price","o-ring price"]
"swing lambat dan pump bocor" -> ["swing motor slow response","hydraulic pump leak"]`;
  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: `Decompose: "${query}"` }] }],
      systemInstruction: { parts: [{ text: SYS }] },
      generationConfig: { maxOutputTokens: 150, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const raw = getText(res.candidates[0]?.content?.parts ?? []).trim();
    const m = raw.match(/\[[\s\S]*?\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 4) : [];
  } catch (err) {
    console.warn('[decomposeAspects] failed:', (err as Error)?.message);
    return [];
  }
}

async function resolveMultiAspectQuery(
  trimmed: string,
  history: Message[],
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  emit({ type: 'thinking', message: 'Memecah query jadi beberapa aspek…' });
  const subs = await decomposeAspects(trimmed);
  // Decompose gagal / cuma 1 aspek → balik ke jalur NL biasa (single search).
  if (subs.length < 2) return resolveNaturalLanguageQuery(trimmed, history, model, emit);

  emit({ type: 'thinking', message: `Mencari ${subs.length} aspek paralel…` });

  // Tiap sub-query → cari di TM + Parts paralel (sama seperti kalau user pisah manual).
  const tasks = subs.flatMap(sub => {
    const clean = stripModelFromQuery(sub);
    return [
      (async () => {
        emit({ type: 'tool_call', tool: 'search_technical_manual' });
        const r = await searchTechnicalManualMulti([clean], model).catch(() => ({ content: '', hasResults: false }));
        emit({ type: 'tool_result', tool: 'search_technical_manual', found: r.hasResults });
        return r;
      })(),
      (async () => {
        emit({ type: 'tool_call', tool: 'search_parts_catalog' });
        const r = await searchPartsCatalog(sub, model, true).catch(() => ({ content: '', hasResults: false }));
        emit({ type: 'tool_result', tool: 'search_parts_catalog', found: r.hasResults });
        return r;
      })(),
    ];
  });

  const results = await Promise.all(tasks);

  // Gabung konten unik (dedup persis) dari semua aspek.
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const r of results) {
    if (r.hasResults && r.content && !seen.has(r.content)) {
      seen.add(r.content);
      blocks.push(r.content);
    }
  }

  if (blocks.length === 0) return resolveNaturalLanguageQuery(trimmed, history, model, emit);
  return { type: 'rag_found', content: blocks.join('\n\n---\n\n'), dataLabel: RAG_LABEL.manual };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateResponseStream(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  onChunk: (text: string) => void,
  onAgentEvent?: (event: import('./react-agent').AgentEvent) => void,
): Promise<string> {
  // Progress indicator — single-pass juga tampilkan "Menganalisa query… / Mencari di …"
  // supaya UI terasa menganalisa (sebelumnya hanya jalur agentic yang punya indikator).
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});

  // Sanitize user input — defense against basic prompt injection.
  // Cap length (cegah DoS via giant prompt) + escape suspicious instruction markers.
  const sanitized = userInput
    .slice(0, 4000)
    .replace(/\[(?:SYSTEM|INSTRUCTION|NEW\s+INSTRUCTION|OVERRIDE|IGNORE\s+PREVIOUS)[^\]]*\]/gi, '[blocked]')
    .replace(/<\|[^|]*\|>/g, '[blocked]'); // ChatML-style tokens
  const trimmed  = sanitized.trim();
  const contents = historyToContents(history, 20);

  emit({ type: 'thinking', message: 'Menganalisa query…' });

  const { isFaultCode, faultQuery } = detectFaultCodeInQuery(trimmed);

  // Service interval pattern (mis. "service 2000 jam", "parts 1000 hm") di-route
  // ke parts pipeline meski isPartsQuery=false (typo, kata berbeda dari keyword).
  // Ini cegah pattern lolos ke NLP path → analyzeIntent return "2000" → embed kabur.
  const hasServiceInterval = !isFaultCode && SERVICE_INTERVAL_RE.test(trimmed);

  // Multi-aspek (2+ pertanyaan dalam 1 query) dicek SEBELUM parts-only routing —
  // cegah "diameter X dan part number Y" nyangkut di parts saja (berat/spec tak dicari).
  const routeResult = isFaultCode
    ? await resolveFaultCodeQuery(faultQuery, model, emit)
    : isMultiAspectQuery(trimmed)
      ? await resolveMultiAspectQuery(trimmed, history, model, emit)
      : (isPartsQuery(trimmed) || hasServiceInterval)
        ? await resolvePartsQuery(trimmed, history, model, emit)
        : await resolveNaturalLanguageQuery(trimmed, history, model, emit);

  if (routeResult.type === 'rag_canned') return streamCanned(routeResult.text, onChunk);

  const isGoogleSearch   = routeResult.type === 'google_search';
  const ragContent       = routeResult.type === 'rag_found' ? routeResult.content   : '';
  const dataLabel        = routeResult.type === 'rag_found' ? routeResult.dataLabel : '';
  const ragConfidence    = routeResult.type === 'rag_found' ? routeResult.confidence : undefined;
  const thinkingLevel    = isFaultCode ? 'medium' : ragContent ? 'low' : 'minimal';
  // RAG: 4096. Google-search fallback (pertanyaan teknis tanpa data lokal, mis.
  // "pengaruh BBM B50 ke filter solar"): 2048 — cukup untuk jawaban lengkap & profesional,
  // bukan terpotong di 512. Casual murni ("halo","oke"): 512 supaya tetap ringkas.
  const maxOutputTokens  = ragContent ? 4096 : isGoogleSearch ? 2048 : 512;
  // MEDIUM confidence caveat — shorter wording, AI baca instruksi handling-nya di SYSTEM_PROMPT
  const caveat = ragConfidence === 'medium'
    ? `\n\n[CONFIDENCE: MEDIUM — data relevan tapi mungkin bukan match persis. Jangan ngarang detail. Reminder verifikasi natural & sekali saja, hanya untuk angka/PN kritis yang langsung dieksekusi; JANGAN stempel kalimat template "verifikasi ke manual fisik" di tiap jawaban.]`
    : '';
  const userText         = ragContent
    ? `${trimmed || 'Halo'}${caveat}\n\n[${dataLabel}]\n${ragContent}`
    : (trimmed || 'Halo');

  contents.push({ role: 'user', parts: [{ text: userText }] });

  const fullText = await callProxyStream({
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT(model, userName) }] },
    generationConfig:  { maxOutputTokens, temperature: 0.3, thinkingConfig: { thinkingLevel } },
  }, onChunk, isGoogleSearch);

  return fullText || FALLBACK_RESPONSE;
}

// ─── Agentic API (Sprint 2) ──────────────────────────────────────────────────
// ReAct loop wrapper. Opt-in via URL param ?agentic=true (lihat App.tsx).
// Tidak ubah generateResponseStream existing — orthogonal path.

export type { AgentEvent } from './react-agent';

/**
 * Multi-step agentic response — AI pilih tool dari catalog 5 tools, decompose
 * query kompleks, panggil tool berurutan/paralel, synthesize jawaban final.
 * Stream final answer via onChunk (sama interface dengan generateResponseStream).
 */
export async function generateResponseAgentic(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  onChunk: (text: string) => void,
  onAgentEvent?: (event: import('./react-agent').AgentEvent) => void,
): Promise<string> {
  // Sanitize input — sama defense seperti generateResponseStream
  const sanitized = userInput
    .slice(0, 4000)
    .replace(/\[(?:SYSTEM|INSTRUCTION|NEW\s+INSTRUCTION|OVERRIDE|IGNORE\s+PREVIOUS)[^\]]*\]/gi, '[blocked]')
    .replace(/<\|[^|]*\|>/g, '[blocked]');
  const trimmed = sanitized.trim() || 'Halo';

  // Lazy import untuk hindari circular deps di kompilasi (react-agent → ai → react-agent)
  const { runReActAgent } = await import('./react-agent');

  const result = await runReActAgent(trimmed, model, userName, history, {
    onChunk,
    onAgentEvent,
  });

  return result || FALLBACK_RESPONSE;
}

export async function generateResponse(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  attachments?: File[]
): Promise<string> {
  const systemInstruction = SYSTEM_PROMPT(model, userName);
  const contents: VContent[] = historyToContents(history);
  const currentParts: Part[] = [];

  if (attachments && attachments.length > 0) {
    const imageResults = await Promise.allSettled(attachments.map(fileToInlineData));
    const imageParts = imageResults
      .filter((r): r is PromiseFulfilledResult<InlineDataPart> => r.status === 'fulfilled')
      .map(r => r.value);
    if (imageParts.length === 0) return 'Maaf, gagal membaca file gambar.';
    currentParts.push(...imageParts);

    try {
      const faultCodes = await extractFaultCodes(imageParts);

      if (faultCodes.length > 0) {
        // Search per code + 2nd-pass Engine Manual (sama seperti text path).
        // Image path sebelumnya tidak punya 2nd-pass sehingga P-code diagnosis
        // tidak ter-inject, dan AI ngarang dari training.
        const settled = await Promise.allSettled(
          faultCodes.map(async code => {
            const terms = extractSearchTerms(code);
            let result = await searchTechnicalManualMulti(terms, model);
            let content = result.content;

            // 2nd-pass: P-codes hanya dari baris yang relevan (extractRelatedPCodes)
            // bukan seluruh chunk — mencegah 20+ embed calls dari chunk panjang
            if (result.hasResults) {
              const pCodes = extractRelatedPCodes(content, extractSearchTerms(code));
              if (pCodes.length > 0) {
                const emResult = await searchEngineManual(pCodes, model);
                if (emResult.hasResults) {
                  content += '\n\n[ENGINE MANUAL]\n' + emResult.content;
                }
              }
            }

            return { code, found: result.hasResults, content };
          }),
        );

        const found: Array<{ code: string; content: string }> = [];
        const notFound: string[] = [];
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            if (r.value.found) found.push({ code: r.value.code, content: r.value.content });
            else notFound.push(r.value.code);
          } else {
            console.warn('[generateResponse] Fault code search failed for one code:', r.reason instanceof Error ? r.reason.message : String(r.reason));
          }
        }

        // Kalau SEMUA code tidak ditemukan → bypass AI, return canned
        if (found.length === 0 && notFound.length > 0) {
          const lines = notFound.map(c => `- Kode \`${c}\` tidak ada di database manual **${model}** yang saya akses.`).join('\n');
          return `Fault code terdeteksi dari gambar: **${notFound.join(', ')}**\n\n${lines}\n\nPastikan pembacaan kode benar dan model unit sesuai (saat ini di-set ke ${model}).`;
        }

        // Instruksi eksplisit ke AI: jelaskan SETIAP kode dengan heading,
        // JANGAN jadikan satu kode sebagai footnote kode lain.
        const noteBase = userInput || 'Analisa fault code ini dan berikan diagnosis lengkap.';
        const note = `Fault code terdeteksi dari gambar: **${faultCodes.join(', ')}**\n\n` +
          `INSTRUKSI: Jelaskan SETIAP fault code di atas dalam heading terpisah (## Kode X). ` +
          `Jangan jadikan satu kode sebagai catatan/footnote kode lain. ` +
          `Kalau beberapa kode muncul di timestamp yang sama, analisa hubungannya setelah penjelasan masing-masing. ` +
          noteBase;

        let injection = `[DATA MANUAL TERSEDIA]\n${found.map(f => `[Fault Code: ${f.code}]\n${f.content}`).join('\n\n===\n\n')}`;

        if (notFound.length > 0) {
          injection += `\n\n[KODE TIDAK DITEMUKAN]\nKode berikut TIDAK ada di database manual ${model}: ${notFound.join(', ')}.\nJANGAN karang detail/diagnosis untuk kode-kode ini.`;
        }

        currentParts.push({ text: `${note}\n\n${injection}` });
      } else {
        currentParts.push({ text: userInput || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.' });
      }
    } catch (err) {
      console.error('Image fault code extraction failed:', err);
      currentParts.push({ text: userInput || 'Analisa gambar ini, identifikasi fault code, dan berikan diagnosis.' });
    }

    contents.push({ role: 'user', parts: currentParts });

    const res = await callProxy({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { maxOutputTokens: 16384, temperature: 0.3, thinkingConfig: { thinkingLevel: 'medium' } },
    });
    const text = getText(res.candidates[0]?.content?.parts ?? []);
    return text || 'Maaf, sistem tidak bisa memproses permintaan ini.';
  }

  return 'Maaf, sistem tidak bisa memproses permintaan ini.';
}
