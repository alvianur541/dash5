import { SYSTEM_PROMPT, jakartaTime } from '../constants';
import { UnitModel, Message, KnowledgeGap } from '../types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, getAuthToken, isPartsQuery, extractPartNumber, searchPartsCatalog, searchServiceIntervalParts, stripModelFromQuery, MODELS_WITHOUT_PARTS_CATALOG } from './supabase';

const PROXY_URL    = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');
export const MODEL        = import.meta.env.VITE_VERTEX_MODEL || 'gemini-3.6-flash';
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
  // OPTIONAL: Gemini bisa balas 200 TANPA candidates (safety block via
  // promptFeedback, atau MAX_TOKENS tanpa content). Tipe wajib-ada dulu bikin
  // `res.candidates[0]` crash saat undefined. Optional → TS paksa `?.[0]`.
  candidates?: Array<{
    content?: { role: string; parts: Part[] };
    finishReason?: string;
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

// ── Token usage accumulator (per pertanyaan) ────────────────────────────────
// callProxy/callProxyStream menambah token ke sini. resetUsage() dipanggil di awal
// tiap entry publik (generateResponse*), getQuestionUsage() dibaca App.tsx setelah
// jawaban selesai → dikirim ke ledger /v1/usage. Single-active-question (frontend
// abort pertanyaan sebelumnya) → accumulator module-level aman.
let _usage = { input: 0, output: 0, calls: 0 };
export function resetUsage(): void { _usage = { input: 0, output: 0, calls: 0 }; }
export function getQuestionUsage(): { input: number; output: number; calls: number; model: string } {
  return { ..._usage, model: MODEL };
}
function addUsage(input?: number, output?: number): void {
  _usage.input += input || 0;
  _usage.output += output || 0;
  _usage.calls += 1;
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
  const json = await res.json();
  const u = json?.usageMetadata ?? {};
  addUsage(u.promptTokenCount, u.candidatesTokenCount);
  return json as VResponse;
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
  // Window konteks lebih lebar (6 pesan, 300 char) — follow-up sering merujuk PN/komponen
  // dari jawaban AI beberapa giliran sebelumnya ("harganya?", "diameternya?", "yang tadi").
  const ctx = history.slice(-6)
    .filter(m => m.content?.trim())
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const systemPrompt = `You are a query classifier and optimizer for Hitachi/KCM heavy equipment documentation search.
Output ONLY valid JSON — no markdown, no preamble, no explanation.

═══ STEP 1: CLASSIFY searchType ═══

"parts"    → Part numbers, spare parts lookup, cross-reference, compatibility, service interval parts (CPM),
             maintenance schedule per X jam/hm, promo harga parts.
             RULE: ANY query mentioning interval (500/1000/2000 jam/hm/hr) → "parts".
             optimizedQuery MUST be ≥3 words. Interval pattern: "X hour service maintenance parts".

"technical" → Diagnosis, troubleshooting, fault codes, specs (torque/pressure/displacement/clearance/
              weight/diameter/length/dimension/size/capacity), procedures (teardown/assembly),
              oil/fuel/coolant capacity, electrical circuit, hydraulic flow, operating procedure.
              RULE: berat/dimensi/diameter/ukuran/clearance sebuah komponen = "technical" (ada di
              Workshop/Technical Manual), BUKAN "parts" — walau komponennya sebuah part.
              NOTE: "harga promo" / "promo Q4" without interval → "parts". With procedure context → "technical".

"general"  → Greetings, acknowledgments, short casual chat directly related to the work context ("halo", "oke", "thanks", "lanjut", "siap", "mantap").
"off_topic" → Questions completely unrelated to heavy equipment, engineering, or technician work context. Examples: recipes, sports, general internet questions, news, weather, cooking, entertainment. Return shouldSearch=false.

═══ STEP 2: BUILD optimizedQuery (parts/technical only) ═══

Rules (apply in order):
1. EXTRACT core intent: component FIRST, then attribute/symptom/action — urutan ini cocok dgn
   spec keyword search. Contoh: "swing motor weight", "bucket pin diameter", "main pump pressure".
2. TRANSLATE Indonesian → English technical terms from Hitachi service manuals
3. STRIP: kenapa/berapa/bagaimana/apa/gimana/cara/coba/tolong/mohon/kok/sih/ya/dong + articles
4. INFER pronouns (itu/ini/nya) → component name from conversation context. NEVER infer model names.
5. NO PADDING: translate exactly what user said. "swing motor" ≠ "swing motor assembly"
6. NO MODEL NAME: never add ZX48U-5A / ZX200-5G / KCM 60ZV etc.
7. KEEP the measurement attribute word — itu kata PEMBEDA utama & memicu pencarian spec.
   weight/berat→weight, diameter→diameter, panjang→length, lebar→width, tinggi→height,
   tekanan→pressure, torsi→torque, clearance, kapasitas→capacity, displacement.
   JANGAN reduksi jadi nama komponen saja ("diameter pin" → "pin" itu SALAH).
   UNIT: include only if user stated it. "berapa berat" → "...weight" (no kg). "berapa kg" → add kg.
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
"diameter pin bucket berapa"                  → technical, "bucket pin diameter"
"panjang arm cylinder"                        → technical, "arm cylinder length"
"berat swing device"                          → technical, "swing device weight"
"clearance valve engine"                      → technical, "engine valve clearance"
"cara adjust relief valve main pump"          → technical, "main pump relief valve adjustment"
"engine tidak mau hidup setelah ganti filter" → technical, "engine no start after fuel filter replacement"
"tekanan hydraulic turun saat boom diangkat"  → technical, "hydraulic pressure drop boom lift"
"masih bocor juga tuh" [ctx: hydraulic cyl]  → technical, "hydraulic cylinder leak"

Technical — wheel loader (KCM/ZW: steering, transmission, lift arm, brake):
"steering berat sebelah"                      → technical, "steering heavy one side"
"transmisi selip pas maju"                    → technical, "transmission slip forward"
"lift arm lambat naik"                        → technical, "lift arm slow raise"
"parking brake nggak ngunci"                  → technical, "parking brake not holding"

Parts — PN, catalog, promo:
"PN YB60000068 itu apa"           → parts, "YB60000068"
"PN filter transmisi"             → parts, "transmission filter"
"harga seal kit swing motor"      → parts, "swing motor seal kit price"
"ada promo filter hydraulic ngga" → parts, "hydraulic filter promo price"
"harga promo seal kit swing"      → parts, "swing motor seal kit promo price"
"reman pump berapa harganya"      → parts, "pump reman promo price"

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
{"shouldSearch":<bool>,"searchType":"technical"|"parts"|"general"|"off_topic","optimizedQuery":"<2-10 word English phrase>"}

shouldSearch=true: technical/parts queries → optimizedQuery filled.
shouldSearch=false: "general" (greetings/acknowledgment kerja) atau "off_topic" (di luar alat berat) → optimizedQuery="".`;

  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const raw = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
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

/**
 * HyDE (Hypothetical Document Embeddings) — tulis SATU kalimat teknis singkat
 * yang "berlagak" kutipan service manual menjawab query. Dipakai sebagai
 * second-pass embedding saat retrieval pertama gagal: kalimat penuh jauh lebih
 * dekat ke frasa manual daripada query 2-3 kata yang embeddingnya kabur.
 *
 * AMAN untuk tool diagnostik: output HyDE HANYA di-embed untuk mencari chunk,
 * TIDAK PERNAH ditampilkan / masuk ke jawaban. Jadi walau kalimatnya salah,
 * paling buruk cuma retrieval kurang pas → fallback web (perilaku lama).
 * Larangan angka spesifik = jaga-jaga supaya vektor tidak bias ke angka karangan.
 */
async function hydeExpand(query: string): Promise<string | null> {
  const SYS = 'Tulis SATU kalimat teknis singkat dalam bahasa Inggris, seolah kutipan dari service manual alat berat, yang menjawab pertanyaan user. Fokus: nama komponen + gejala/fungsi/sistem terkait. DILARANG menyebut angka spesifik (torque/tekanan/RPM/PN — jangan mengarang). DILARANG menyebut nama/merek model. Output HANYA satu kalimat itu, tanpa kutip, tanpa preamble.';
  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: `Pertanyaan teknisi: "${query.slice(0, 300)}"` }] }],
      systemInstruction: { parts: [{ text: SYS }] },
      generationConfig: { maxOutputTokens: 80, temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const out = getText(res.candidates?.[0]?.content?.parts ?? []).trim().replace(/^["'`]|["'`]$/g, '');
    const wc = out.split(/\s+/).filter(Boolean).length;
    // Guard: 4-45 kata, bukan echo query, bukan refusal ("I cannot"/"maaf").
    if (wc < 4 || wc > 45) return null;
    if (/\b(cannot|can't|unable|maaf|sorry|tidak dapat)\b/i.test(out)) return null;
    return stripModelFromQuery(out);
  } catch {
    return null;
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

  const raw = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
  if (!raw || raw.toUpperCase() === 'NONE') return [];
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

/**
 * Guard loop degeneratif — model kadang macet mengulang frasa identik sampai
 * kena cap token (kejadian nyata: "Ditulis oleh Dash⁵. " ×50 di akhir jawaban;
 * temperature rendah tanpa repetition penalty rawan ini).
 *
 * Dua pola yang di-collapse (keduanya AMAN untuk konten sah):
 * 1. Unit kalimat (diakhiri .!?…) yang persis sama berulang ≥4× beruntun → 1×.
 *    Separator tabel markdown ("| --- |") tidak kena karena tanpa punctuation.
 * 2. Baris utuh identik berulang ≥4× beruntun → 1×. Baris data tabel yang sah
 *    tidak pernah identik 4× beruntun (PN/qty pasti beda).
 */
function collapseDegenerateLoops(text: string): string {
  let out = text;
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/([^\n]{8,160}?[.!?…]\s*)(?:\1){3,}/g, '$1')
      .replace(/(^[^\n]{4,160}\n)(?:\1){3,}/gm, '$1');
  }
  return out;
}

// Deteksi dini di tail stream — unit kalimat sama berulang ≥6× berarti model
// sudah pasti macet; hentikan baca supaya tidak bayar token sampah sampai cap.
const TAIL_LOOP_RE = /([^\n]{8,120}?[.!?…]\s*)(?:\1){5,}$/;

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
  let lastUsage: { promptTokenCount?: number; candidatesTokenCount?: number } | null = null;

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
        if (json.usageMetadata) lastUsage = json.usageMetadata; // kumulatif; chunk terakhir menang
        const text = getText(json.candidates?.[0]?.content?.parts ?? []);
        if (text) { fullText += text; onChunk(text); }
      } catch { /* ignore malformed chunk */ }
    }
    // Loop degeneratif terdeteksi di tail → stop baca (hemat token), teks
    // dibersihkan sebelum return; UI final di-overwrite dgn hasil bersih.
    if (fullText.length > 400 && TAIL_LOOP_RE.test(fullText.slice(-800))) {
      console.warn('[stream] degenerate loop terdeteksi — stream dihentikan dini');
      reader.cancel().catch(() => {});
      break;
    }
  }
  addUsage(lastUsage?.promptTokenCount, lastUsage?.candidatesTokenCount);
  return collapseDegenerateLoops(fullText);
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
      const compressed = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
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
  return `Kode \`${faultQuery}\` tidak ditemukan di database manual **${model}**.

Dua hal yang paling sering jadi penyebabnya:
1. **Pembacaan kode** — pastikan digit dan suffix persis seperti di monitor (format valid: \`11006-2\`, \`ENG:00436-04\`). Kalau ragu, kirim foto layar monitor — saya baca langsung dari situ.
2. **Model unit** — chat ini di-set ke **${model}**. Kode dari unit lain tidak akan ketemu di sini.

Kalau keduanya sudah benar dan kode tetap tidak ada, kemungkinan di luar cakupan manual yang tersedia — eskalasi ke Technical Support Department dengan menyebut kode + serial number unit.`;
}

function partsNotFoundTemplate(query: string, model: string): string {
  return `Parts untuk **${query}** tidak ketemu di katalog **${model}** yang saya akses.

Supaya pencariannya kena:
1. Pakai nama komponen sesuai istilah katalog (English) — mis. \`seal kit; swing motor\`, \`bucket tooth\`.
2. Kalau pegang part number, kirim PN-nya langsung — pencarian PN paling akurat.
3. Sebut area komponen (engine / hydraulic / undercarriage / attachment) untuk mempersempit section.

Alternatif: cek Parts Catalog fisik unit, atau konfirmasi ke tim parts dengan menyebut model + nama komponen.`;
}

// Catatan: adaptive-retrieval low-confidence dulu bypass AI (lowConfidenceTemplate).
// Sekarang low-confidence & no-result pada jalur teknis NL di-fallback ke web
// (google_search mode 'technical' + EXTERNAL_DIRECTIVE) — lebih berguna daripada
// buntu canned, tetap anti-halu untuk angka unit. Template lama dihapus.

function offTopicTemplate(): string {
  return `Scope saya khusus technical support alat berat Hitachi/KCM — fault code, troubleshooting, spec, parts, dan jadwal maintenance.

Untuk pertanyaan tadi, saya bukan sumber yang tepat. Ada yang perlu dicek di unit kamu?`;
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

// Directive jalur fallback web (mode 'technical'). Disuntik ke USER-turn (BUKAN
// system prompt) supaya SYSTEM_PROMPT tetap byte-identical → prompt caching hit.
// Guardrail: web boleh untuk konsep/diagnosa umum, HARAM untuk klaim angka unit.
const EXTERNAL_DIRECTIVE = (model: string): string =>
  `[SUMBER EKSTERNAL] Manual internal ${model} tidak memuat data spesifik untuk pertanyaan ini. Jawab profesional memakai prinsip teknik umum + hasil penelusuran web. ATURAN WAJIB:
- Sampaikan sekali di awal, natural: jawaban ini rujukan umum industri, bukan dari manual resmi ${model}.
- Angka eksekusi-kritis (torque, tekanan, PN, clearance, fault code) DILARANG diklaim sebagai spec resmi unit. Kalau memberi angka, tandai sebagai "kisaran umum" dan minta verifikasi ke manual fisik unit.
- Fokus: prinsip kerja, alur diagnosa sistematis, penyebab probable, praktik standar industri.
- Ringkas, actionable, register rekan teknisi. Jangan menyalin mentah hasil web — sintesiskan.`;

// Partial-gap detector — jawaban rag_found yang JUJUR mengaku bagian penting tak
// termuat di data (mis. kasus kapasitas total coolant: chunk cuma "engine only").
// Deterministik & gratis (regex di teks final) — tak perlu LLM classify tambahan.
// Sengaja ketat (harus menyebut "data/chunk/manual/knowledge") agar tak false-positive
// pada kalimat biasa yang kebetulan pakai kata "tidak ada".
const GAP_PHRASE_RE = /tidak tercantum|belum ter-?ingest|tidak dimuat|(?:tidak|belum)\s+(?:tersedia|terdapat|ada|termuat)\s+(?:di|dalam|pada)\s+(?:data|chunk|manual|knowledge|berkas)|di luar cakupan data|tidak ada di (?:data|knowledge)/i;

// ─── Tipe routing ──────────────────────────────────────────────────────────────

/** Discriminated union — hasil routing RAG sebelum AI dipanggil */
type RagRouteResult =
  | { type: 'rag_found';  content: string; dataLabel: string; confidence?: 'high' | 'medium' | 'low' }
  | { type: 'rag_canned'; text: string; gap?: KnowledgeGap }   // bypass AI, kirim teks ini langsung; gap=KB tak punya data
  // Fallback Google-search grounding. mode:
  //   'casual'    → obrolan ringan (halo/oke) — no directive khusus
  //   'technical' → pertanyaan teknis TANPA data manual → jawab pakai referensi
  //                 umum/web + directive guardrail (label sumber, no fabrikasi angka unit)
  | { type: 'google_search'; mode: 'casual' | 'technical' };

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
    return { type: 'rag_canned', text: faultCodeNotFoundTemplate(faultQuery, model), gap: { reason: 'not_found', topic: faultQuery } };
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
    return { type: 'rag_canned', text: partsNotFoundTemplate(trimmed, model), gap: { reason: 'not_found', topic: trimmed } };
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
  if (!intent.shouldSearch) return { type: 'google_search', mode: 'casual' };

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
      : { type: 'rag_canned', text: partsNotFoundTemplate(trimmed, model), gap: { reason: 'not_found', topic: trimmed } };
  }

  // Technical: guard juga untuk query pendek
  const rawOpt = intent.optimizedQuery?.trim() ?? '';
  const query  = stripModelFromQuery(rawOpt.split(/\s+/).length >= 2 ? rawOpt : trimmed);
  emit({ type: 'tool_call', tool: 'search_technical_manual' });
  let ragResult = await searchTechnicalManualMulti([query], model);
  emit({ type: 'tool_result', tool: 'search_technical_manual', found: ragResult.hasResults });

  if (ragResult.ragError) {
    const errMsg = ragErrorTemplate(ragResult.ragError);
    if (errMsg) return { type: 'rag_canned', text: errMsg };
  }

  // ── HyDE second-pass adaptif ──────────────────────────────────────────────
  // Retrieval pertama miss/low → SEBELUM menyerah ke web, coba lagi dengan
  // embedding dari "kalimat jawaban hipotetis" (HyDE). Query pendek/kabur
  // (2-3 kata) sering punya embedding noisy; kalimat teknis penuh jauh lebih
  // dekat ke frasa manual. AMAN: teks HyDE HANYA dipakai untuk embedding,
  // tidak pernah masuk jawaban → nol risiko halu. Latency cuma di jalur gagal.
  if (!ragResult.hasResults || ragResult.confidence === 'low') {
    const hyde = await hydeExpand(trimmed);
    if (hyde) {
      emit({ type: 'thinking', message: 'Memperluas cakupan pencarian…' });
      emit({ type: 'tool_call', tool: 'search_technical_manual' });
      const retry = await searchTechnicalManualMulti([hyde], model);
      emit({ type: 'tool_result', tool: 'search_technical_manual', found: retry.hasResults });
      // Pakai hasil retry hanya kalau BENAR lebih baik (ada isi & bukan low).
      if (retry.hasResults && retry.confidence !== 'low') ragResult = retry;
    }
  }

  // Manual internal tidak memuat / cuma nyerempet (confidence rendah) → JANGAN buntu.
  // Fallback ke referensi umum + web grounding (mode 'technical' → directive guardrail
  // di generateResponseStream: label sumber eksternal, no fabrikasi angka unit).
  // Fault code & parts tetap internal-only (di resolver masing-masing) karena
  // web tak bisa kasih PN Hitachi asli / arti fault code model-spesifik dgn aman.
  if (!ragResult.hasResults) return { type: 'google_search', mode: 'technical' };
  if (ragResult.confidence === 'low') return { type: 'google_search', mode: 'technical' };

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
// \w* di akhir grup → toleran sufiks Indonesia (beratnya/diameternya/panjangnya).
const MULTI_TECH_RE = /\b(?:berat|weight|diameter|panjang|length|lebar|width|tinggi|height|tebal|thickness|ukuran|size|tekanan|pressure|torque|torsi|clearance|displacement|capacity|kapasitas|rpm|spec|stroke|bore|pn|part\s*number|partnumber|harga|price|promo|motor|pump|valve|cylinder|silinder|filter|seal|gasket|bearing|rotor|stator|pin|bushing|shaft|swing|boom|arm|bucket|blade|track|engine|mesin|hydraulic|hidrolik|sensor|relay|solenoid|controller|alternator|starter|nozzle|injector|turbo|radiator|coupling|reduction|gear)\w*/i;
// Atribut/permintaan terukur — buat deteksi follow-up pendek multi-atribut ("berat dan diameternya").
const MULTI_ATTR_RE = /\b(?:berat|weight|diameter|panjang|length|lebar|width|tinggi|height|tebal|thickness|tekanan|pressure|torque|torsi|clearance|displacement|kapasitas|capacity|rpm|harga|price|part\s*number|partnumber|pn|spec|ukuran|size)\w*/gi;

function isMultiAspectQuery(q: string): boolean {
  if (!MULTI_CONNECTOR_RE.test(q)) return false;
  if (!MULTI_TECH_RE.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean).length;
  const attrCount = (q.match(MULTI_ATTR_RE) ?? []).length;
  // ≥5 kata (query penuh) ATAU ≥2 atribut terukur (follow-up pendek "berat dan diameternya").
  return words >= 5 || attrCount >= 2;
}

// Pecah query → array sub-query English (1 komponen+atribut tiap item). Max 4.
// Sadar-konteks: resolusi rujukan ("itu/nya/tadi") ke komponen dari percakapan sebelumnya.
async function decomposeAspects(query: string, history: Message[] = []): Promise<string[]> {
  const SYS = `Break a heavy-equipment query into independent English sub-queries — ONE component+attribute each. Translate Indonesian → English technical terms. NO model names. Output ONLY a JSON array of strings (max 4), no markdown, no preamble.
RESOLVE references (itu/ini/nya/tadi/tersebut) to the concrete component from the conversation context. If user says "berat & diameternya" after discussing a pin, expand to that component.
Examples:
"berat swing motor dan partnumber rotor" -> ["swing motor weight","rotor part number"]
"diameter pin bucket dan part numbernya" -> ["bucket pin diameter","bucket pin part number"]
"harga seal kit swing dan o-ring" -> ["swing motor seal kit price","o-ring price"]
"swing lambat dan pump bocor" -> ["swing motor slow response","hydraulic pump leak"]
[ctx: bahas swing motor] "berat dan diameternya" -> ["swing motor weight","swing motor diameter"]`;
  const ctx = history.slice(-4)
    .filter(m => m.content?.trim())
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`)
    .join('\n');
  const userMsg = ctx ? `Conversation so far:\n${ctx}\n\nDecompose this latest query: "${query}"` : `Decompose: "${query}"`;
  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      systemInstruction: { parts: [{ text: SYS }] },
      generationConfig: { maxOutputTokens: 150, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const raw = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
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
  const subs = await decomposeAspects(trimmed, history);
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

// ─── Answer cache (sisi-klien, per-perangkat) ───────────────────────────────
// Cache jawaban FINAL untuk query MANDIRI (fault code, parts, spec) → re-ask &
// tap quick-start chip identik jadi instan + gratis (poin #3 best-practice RAG).
// Bukan lintas-teknisi (itu butuh Supabase), tapi re-ask per-perangkat umum.
//
// GUARDRAIL KETAT (jaga fondasi anti-halu & kesegaran):
//   - HANYA cache jawaban dari DATA MANUAL (routeResult.type === 'rag_found').
//     Web-fallback (google_search), canned, casual → TIDAK di-cache.
//   - Query mandiri saja: yang mengandung rujukan konteks (itu/ini/nya/tadi)
//     di-skip — jawabannya bergantung percakapan sebelumnya.
//   - Di-scope per userName → jawaban ber-nama tidak bocor antar user 1 device.
//   - TTL 3 hari → batasi basi kalau manual di-ingest ulang.
//   - Jalur gambar & agentic TIDAK ikut (unik / opt-in).
const ANSWER_CACHE_PREFIX = 'dash-ans:';
const ANSWER_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CONTEXT_REF_RE = /\b(itu|ini|nya|tadi|tersebut|barusan|sebelumnya)\b/i;

function answerCacheKey(model: string, userName: string, query: string): string | null {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (q.length < 6 || q.length > 300) return null;   // terlalu pendek (casual) / panjang
  if (CONTEXT_REF_RE.test(q)) return null;            // context-dependent → jangan cache
  return `${ANSWER_CACHE_PREFIX}${model}::${userName.toLowerCase()}::${q}`;
}

function readAnswerCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { text, exp } = JSON.parse(raw) as { text?: unknown; exp?: unknown };
    if (typeof text !== 'string' || typeof exp !== 'number' || Date.now() > exp) {
      localStorage.removeItem(key);
      return null;
    }
    return text;
  } catch { return null; }
}

function writeAnswerCache(key: string, text: string): void {
  try {
    if (text.length < 40 || text.length > 20000) return; // jangan cache jawaban sampah/kepanjangan
    localStorage.setItem(key, JSON.stringify({ text, exp: Date.now() + ANSWER_CACHE_TTL_MS }));
  } catch { /* localStorage quota / disabled — abaikan, cache opsional */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateResponseStream(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  onChunk: (text: string) => void,
  onAgentEvent?: (event: import('./react-agent').AgentEvent) => void,
  onMeta?: (meta: { knowledgeGap?: KnowledgeGap }) => void,
): Promise<string> {
  resetUsage(); // mulai akumulasi token untuk 1 pertanyaan (cost ledger)
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

  // Answer-cache HIT → stream instan, lewati embed/search/LLM total (gratis:
  // resetUsage() bikin token=0 → tidak ke-log ledger). Cache hanya berisi
  // jawaban dari data manual (lihat write di bawah), jadi hit = jawaban valid.
  const cacheKey = answerCacheKey(model, userName, trimmed);
  if (cacheKey) {
    const cached = readAnswerCache(cacheKey);
    if (cached) {
      console.info('[answer-cache] HIT');
      // Cached = jawaban dari data manual (rag_found). Tetap cek partial-gap agar
      // re-ask identik tetap memunculkan tawaran Catatan Lapangan bila relevan.
      if (GAP_PHRASE_RE.test(cached)) onMeta?.({ knowledgeGap: { reason: 'partial', topic: trimmed } });
      // Langsung stream (agentEvents kosong → indikator tak muncul, mulus & instan).
      return streamCanned(cached, onChunk);
    }
  }

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

  if (routeResult.type === 'rag_canned') {
    // Not-found (fault/parts) = KB gap → tawarkan Catatan Lapangan. Off-topic/error tidak.
    if (routeResult.gap) onMeta?.({ knowledgeGap: routeResult.gap });
    return streamCanned(routeResult.text, onChunk);
  }

  const isGoogleSearch   = routeResult.type === 'google_search';
  const gsTechnical      = routeResult.type === 'google_search' && routeResult.mode === 'technical';
  const ragContent       = routeResult.type === 'rag_found' ? routeResult.content   : '';
  const dataLabel        = routeResult.type === 'rag_found' ? routeResult.dataLabel : '';
  const ragConfidence    = routeResult.type === 'rag_found' ? routeResult.confidence : undefined;
  // Technical external-fallback butuh reasoning tipis utk sintesis rapi; casual minimal.
  const thinkingLevel    = isFaultCode ? 'medium' : (ragContent || gsTechnical) ? 'low' : 'minimal';
  // RAG: 4096. Fallback web teknis (pertanyaan teknis tanpa data manual, mis.
  // "pengaruh BBM B50 ke filter solar"): 2048 — jawaban lengkap & profesional.
  // Casual murni ("halo","oke") + casual google: 512 supaya ringkas.
  const maxOutputTokens  = ragContent ? 4096 : gsTechnical ? 2048 : 512;
  // MEDIUM confidence caveat — shorter wording, AI baca instruksi handling-nya di SYSTEM_PROMPT
  const caveat = ragConfidence === 'medium'
    ? `\n\n[CONFIDENCE: MEDIUM — data relevan tapi mungkin bukan match persis. Jangan ngarang detail. Reminder verifikasi natural & sekali saja, hanya untuk angka/PN kritis yang langsung dieksekusi; JANGAN stempel kalimat template "verifikasi ke manual fisik" di tiap jawaban.]`
    : '';
  const userText         = ragContent
    ? `${trimmed || 'Halo'}${caveat}\n\n[${dataLabel}]\n${ragContent}`
    : gsTechnical
      ? `${trimmed}\n\n${EXTERNAL_DIRECTIVE(model)}`
      : (trimmed || 'Halo');

  // Timestamp di user-turn, BUKAN system prompt — system prompt harus tetap
  // byte-identical antar request agar prompt caching bisa hit (lihat constants.ts).
  contents.push({ role: 'user', parts: [{ text: `[${jakartaTime()} WIB]\n${userText}` }] });

  const fullText = await callProxyStream({
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT(model, userName) }] },
    generationConfig:  { maxOutputTokens, temperature: 0.3, thinkingConfig: { thinkingLevel } },
  }, onChunk, isGoogleSearch);

  // Simpan ke answer-cache HANYA jawaban dari DATA MANUAL (rag_found) — bukan
  // web-fallback/canned/casual. Re-ask identik berikutnya jadi instan & gratis.
  if (cacheKey && routeResult.type === 'rag_found' && fullText) {
    writeAnswerCache(cacheKey, fullText);
  }

  // Deteksi knowledge-gap untuk memicu tawaran Catatan Lapangan:
  //   web_fallback → manual internal kosong, jawaban dari referensi umum
  //   partial      → rag_found tapi jawaban akui bagian penting tak termuat (regex frasa)
  if (gsTechnical) {
    onMeta?.({ knowledgeGap: { reason: 'web_fallback', topic: trimmed } });
  } else if (routeResult.type === 'rag_found' && fullText && GAP_PHRASE_RE.test(fullText)) {
    onMeta?.({ knowledgeGap: { reason: 'partial', topic: trimmed } });
  }

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
  resetUsage(); // mulai akumulasi token untuk 1 pertanyaan (cost ledger)
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
  attachments?: File[],
  onChunk?: (text: string) => void,
  onAgentEvent?: (event: import('./react-agent').AgentEvent) => void,
): Promise<string> {
  resetUsage(); // mulai akumulasi token untuk 1 pertanyaan (cost ledger)
  // Progress indicator — jalur foto adalah yang PALING lambat (OCR → search per
  // kode → 2nd-pass Engine Manual → generate). Tanpa event, user lihat layar diam.
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});
  const systemInstruction = SYSTEM_PROMPT(model, userName);
  const contents: VContent[] = historyToContents(history);
  const currentParts: Part[] = [];

  if (attachments && attachments.length > 0) {
    emit({ type: 'thinking', message: 'Membaca foto…' });
    const imageResults = await Promise.allSettled(attachments.map(fileToInlineData));
    const imageParts = imageResults
      .filter((r): r is PromiseFulfilledResult<InlineDataPart> => r.status === 'fulfilled')
      .map(r => r.value);
    if (imageParts.length === 0) return 'Maaf, gagal membaca file gambar.';
    currentParts.push(...imageParts);

    try {
      emit({ type: 'thinking', message: 'Memindai layar monitor untuk fault code…' });
      const faultCodes = await extractFaultCodes(imageParts);

      if (faultCodes.length > 0) {
        emit({
          type: 'thinking',
          message: faultCodes.length === 1
            ? `Terbaca kode ${faultCodes[0]} — mencocokkan ke manual…`
            : `Terbaca ${faultCodes.length} kode: ${faultCodes.join(', ')} — mencocokkan ke manual…`,
        });
        emit({ type: 'tool_call', tool: 'search_technical_manual' });
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
                emit({ type: 'tool_call', tool: 'search_engine_manual' });
                const emResult = await searchEngineManual(pCodes, model);
                emit({ type: 'tool_result', tool: 'search_engine_manual', found: emResult.hasResults });
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

        emit({ type: 'tool_result', tool: 'search_technical_manual', found: found.length > 0 });

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
        emit({ type: 'thinking', message: 'Tidak ada fault code terbaca — menganalisa kondisi visual…' });
        currentParts.push({ text: userInput || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.' });
      }
    } catch (err) {
      console.error('Image fault code extraction failed:', err);
      emit({ type: 'thinking', message: 'Pembacaan kode gagal — menganalisa gambar langsung…' });
      currentParts.push({ text: userInput || 'Analisa gambar ini, identifikasi fault code, dan berikan diagnosis.' });
    }

    // Timestamp di user-turn, BUKAN system prompt (lihat constants.ts) — part terpisah,
    // tidak mengganggu urutan image/text part yang sudah disusun di currentParts.
    contents.push({ role: 'user', parts: [{ text: `[${jakartaTime()} WIB]` }, ...currentParts] });

    emit({ type: 'thinking', message: 'Menyusun diagnosis…' });

    // 8192 (turun dari 16384): multi-code image analysis tetap muat — jalur fault
    // code teks pakai 4096 & cukup. Cap lebih rendah = latency & biaya turun.
    const body: VRequest = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3, thinkingConfig: { thinkingLevel: 'medium' } },
    };

    // Streaming kalau caller kasih onChunk — jawaban muncul bertahap seperti jalur
    // teks (sebelumnya non-stream: user nunggu diam lalu jawaban muncul sekaligus).
    if (onChunk) {
      const streamed = await callProxyStream(body, onChunk);
      emit({ type: 'done' });
      return streamed || 'Maaf, sistem tidak bisa memproses permintaan ini.';
    }

    const res = await callProxy(body);
    emit({ type: 'done' });
    const text = collapseDegenerateLoops(getText(res.candidates?.[0]?.content?.parts ?? []));
    return text || 'Maaf, sistem tidak bisa memproses permintaan ini.';
  }

  return 'Maaf, sistem tidak bisa memproses permintaan ini.';
}
