import { SYSTEM_PROMPT, SYSTEM_PROMPT_CASUAL, jakartaTime } from './constants';
import { UnitModel, Message, InlineImage } from './types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, isPartsQuery, extractPartNumber, searchPartsCatalog, searchServiceIntervalParts, stripModelFromQuery, MODELS_WITHOUT_PARTS_CATALOG } from './rag';
import { deps } from './deps';

// Rollback: set VERTEX_MODEL=gemini-3.6-flash di Cloud Run (masih di ALLOWED_MODELS).
export const MODEL        = process.env.VERTEX_MODEL || 'gemini-3.7-flash';
export const INTENT_MODEL = 'gemini-3.1-flash-lite';

// thoughtSignature (Gemini 3.x) WAJIB dikembalikan utuh di function calling multi-giliran.
interface TextPart            { text: string; thought?: boolean; thoughtSignature?: string }
interface InlineDataPart      { inlineData: { mimeType: string; data: string } }
interface FunctionCallPart    { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
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
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  };
  tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE' } };
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

// gemini-3.7 rejects thinkingLevel 'minimal' with HTTP 400 - raise it to 'low' instead.
const NO_MINIMAL_THINKING_RE = /^gemini-3\.7-/i;

function clampThinking(body: VRequest, model: string): VRequest {
  const asli = body.generationConfig?.thinkingConfig?.thinkingLevel;
  if (!asli) return body;

  const override = deps().thinkOverride;
  let lvl: ThinkingLevel = override && model !== INTENT_MODEL ? override : asli;
  if (lvl === 'minimal' && NO_MINIMAL_THINKING_RE.test(model)) lvl = 'low';

  if (lvl === asli) return body;
  return {
    ...body,
    generationConfig: {
      ...body.generationConfig,
      thinkingConfig: { thinkingLevel: lvl },
    },
  };
}

export interface VResponse {
  // Optional: Gemini bisa balas 200 tanpa candidates (safety block / MAX_TOKENS) → wajib akses `?.[0]`.
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

// Progress event (thinking/tool_call/tool_result) — single-pass juga pakai ini utk indikator UI.
type AgentEventEmit = (event: import('./react-agent').AgentEvent) => void;

// Browser sudah mengubah File jadi base64 sebelum kirim — server tak punya FileReader.
function toInlineData(img: InlineImage): InlineDataPart {
  return { inlineData: { mimeType: img.mimeType, data: img.data } };
}

export function resetUsage(): void {
  const u = deps().usage;
  u.input = 0; u.output = 0; u.calls = 0; u.thinking = 0; u.cached = 0;
}
export function getQuestionUsage(): { input: number; output: number; calls: number; model: string } {
  return { ...deps().usage, model: MODEL };
}
// Thinking tokens are billed as output - count them there or the cost ledger under-reports.
function addUsage(input?: number, output?: number, thoughts?: number, cached?: number): void {
  const u = deps().usage;
  u.input    += input || 0;
  u.output   += (output || 0) + (thoughts || 0);
  u.thinking += thoughts || 0;
  u.cached   += cached || 0;
  u.calls    += 1;
}

export async function callProxy(body: VRequest, enableGoogleSearch = false, modelOverride?: string): Promise<VResponse> {
  const modelUsed = modelOverride ?? MODEL;
  const json = await deps().generate(clampThinking(body, modelUsed), modelUsed, enableGoogleSearch);
  const u = json?.usageMetadata ?? {};
  addUsage(u.promptTokenCount, u.candidatesTokenCount, u.thoughtsTokenCount, u.cachedContentTokenCount);
  return json as VResponse;
}

export function getText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => 'text' in p && !('thought' in p))
    .map(p => p.text)
    .join('');
}

/** Bersihkan optimizedQuery AI: dedup kata (via synonym map) + cap 10 kata. Deterministik. */
function cleanOptimizedQuery(query: string): string {
  if (!query.trim()) return query;

  // Synonym → canonical utk dedup. JANGAN map unit (kg/MPa/rpm) — query unit-spesifik jadi rusak.
  const SYNONYMS: Record<string, string> = {
    mass: 'weight', berat: 'weight',
    spec: 'specification', specs: 'specification',
    assy: 'assembly', asm: 'assembly',
    press: 'pressure', tekanan: 'pressure',
    vol: 'volume', cap: 'capacity', kapasitas: 'capacity',
  };
  // Filler yang sering di-pad AI. 'specification' sengaja TIDAK di sini (kata penting, ada di SYNONYMS).
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
             ALSO meta questions about the ASSISTANT itself or the USER ("kamu itu apa", "kamu siapa",
             "kamu bisa apa aja", "siapa saya", "cara pakai aplikasi ini", "fitur kamu apa") — these are
             NOT off_topic; the assistant answers them itself. Return shouldSearch=false.
             ALSO current time/date questions ("sekarang jam berapa", "hari ini tanggal berapa") — the
             assistant HAS the current timestamp and answers directly. NOT off_topic.
             ALSO language/translation requests about the conversation ("in japanese", "in english",
             "translate to english", "pakai bahasa indo") — the assistant switches/translates itself.
             NOT off_topic.
"off_topic" → Questions clearly about an UNRELATED domain: recipes, sports, politics, news, weather, cooking, entertainment, general internet trivia. ALSO company/organization matters (management names, direksi, stock, corporate news/rumor, "siapa presiden direktur X") and news/rumor about brands — the assistant has NO reliable data for these and must NOT answer. NOT for questions about the assistant/user/app/current time. Return shouldSearch=false.

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
"halo mas"          → general, ""
"oke siap"          → general, ""
"thanks"            → general, ""
"kamu itu apa"      → general, ""
"kau itu apa sih"   → general, ""
"kamu bisa apa aja" → general, ""
"siapa saya"        → general, ""
"cara pakai app ini"→ general, ""
"sekarang jam berapa"      → general, ""
"hari ini tanggal berapa"  → general, ""
"in japanese"              → general, ""
"translate to english"     → general, ""
"pakai bahasa indo lagi"   → general, ""

Off-topic (redirect, do NOT answer) — culinary, sports, politics, news, weather, entertainment, general trivia:
"cara bikin sate padang"  → off_topic, ""
"resep nasi goreng"       → off_topic, ""
"cara masak rendang"      → off_topic, ""
"siapa presiden sekarang" → off_topic, ""
"siapa presiden direktur hexindo" → off_topic, ""
"katanya hitachi mau ganti nama"  → off_topic, ""
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

const HISTORY_FULL_TAIL = 6;
const HISTORY_OLD_CAP   = 2500;

function historyToContents(history: Message[], window = 20): VContent[] {
  const recent = history.slice(-window).filter(m => m.content?.trim());
  return recent.map((m, i) => {
    const isOld = i < recent.length - HISTORY_FULL_TAIL;
    const text = isOld && m.content.length > HISTORY_OLD_CAP
      ? m.content.slice(0, HISTORY_OLD_CAP) + '\n…[sisa pesan lama dipangkas]'
      : m.content;
    return {
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text }] as Part[],
    };
  });
}

async function extractFaultCodes(imageParts: InlineDataPart[]): Promise<string[]> {
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

const TAIL_LOOP_RE = /([^\n]{8,120}?[.!?…]\s*)(?:\1){5,}$/;

export const STREAM_CUT_NOTE =
  '\n\n> ⚠️ Jawaban terputus di tengah — koneksi ke AI sempat putus. Kirim ulang pertanyaanmu untuk jawaban lengkap.';

export async function callProxyStream(
  body: VRequest,
  onChunk: (text: string) => void,
  enableGoogleSearch = false,
): Promise<string> {
// Batas keras anti-runaway saja. Jangan diturunkan ke 40 dtk lagi — jawaban panjang
// (thinking ~1000 token + 1500 token teks) sah memakan lebih dari itu dan akan terpotong.
  const STREAM_TIMEOUT_MS = 90_000;
// Nol chunk sejak awal = stream benar-benar mati. Chunk thinking sudah dihitung hidup.
// ⚠️ 45 dtk, BUKAN 25. Terukur 16 Agu 2026: respons Vertex kadang tertahan ~24 dtk di level
// KONEKSI (`[vertex-stream] header=24033ms chunk1=24034ms` — data mengalir 1 ms setelah header).
// Dengan ambang 25 dtk, hang itu tepat di batas: kadang lolos, kadang dibunuh lalu diulang —
// dan pengulangannya yang membuat total membengkak jadi 58-79 dtk. Lebih baik satu jawaban
// lambat 28 dtk daripada tiga percobaan 80 dtk.
  const FIRST_TOKEN_TIMEOUT_MS = 45_000;

  const MAX_ATTEMPT = 3;
  let attempt = 0;
  let fullText = '';
  interface UsageMeta {
    promptTokenCount?: number; candidatesTokenCount?: number;
    thoughtsTokenCount?: number; cachedContentTokenCount?: number;
  }
  const usageBox: { last: UsageMeta | null } = { last: null };

  while (true) {
  attempt++;
  fullText = '';
  let upstreamError: string | null = null;
  let retryNeeded = false;
  let quotaFull = false;

  const ctrl = new AbortController();
  const hardTimer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);

  // Watchdog stream MATI (nol chunk sama sekali), bukan stream yang sedang berpikir.
  let firstTokenSeen = false;
  let streamHidup    = false;
  const watchdog = setTimeout(() => {
    if (!streamHidup) {
      console.warn('[stream] %d dtk tanpa satu chunk pun — batalkan & ulang', FIRST_TOKEN_TIMEOUT_MS / 1000);
      ctrl.abort();
    }
  }, FIRST_TOKEN_TIMEOUT_MS);

  try {
    await deps().stream(clampThinking(body, MODEL), MODEL, c => {
      if (c.error) {
        if (c.code === 429) { quotaFull = true; ctrl.abort(); return; }
        upstreamError = String(c.error);
        ctrl.abort();
        return;
      }
      // Chunk thinking TIDAK berisi teks tapi membuktikan stream hidup — kalau watchdog cuma
      // menghitung teks, jawaban yang berpikir lama dibunuh lalu diulang dari nol.
      if (c.live && !streamHidup) { streamHidup = true; clearTimeout(watchdog); }
      if (c.usageMetadata) usageBox.last = c.usageMetadata; // kumulatif; chunk terakhir menang
      if (c.text) {
        firstTokenSeen = true;
        fullText += c.text; onChunk(c.text);
        if (fullText.length > 400 && TAIL_LOOP_RE.test(fullText.slice(-800))) {
          console.warn('[stream] degenerate loop terdeteksi — stream dihentikan dini');
          ctrl.abort();
        }
      }
    }, { enableGoogleSearch, signal: ctrl.signal });
  } catch (err) {
    // Abort yang KITA picu (error upstream / loop / watchdog) sudah punya penanganannya sendiri.
    if (!ctrl.signal.aborted) upstreamError = (err as Error)?.message ?? 'Stream gagal';
  } finally {
    clearTimeout(watchdog);
    clearTimeout(hardTimer);
  }

  if (quotaFull) throw new Error('KUOTA_PENUH');

  if (upstreamError) {
    if (fullText.trim()) {
      console.warn('[stream] upstream error setelah sebagian teks:', upstreamError);
      fullText += STREAM_CUT_NOTE;
      onChunk(STREAM_CUT_NOTE);
    } else if (attempt < MAX_ATTEMPT) {
      // Belum ada teks → aman diulang, teknisi tak melihat apa pun.
      console.warn('[stream] upstream gagal (%s) — percobaan %d/%d, ulangi', upstreamError, attempt, MAX_ATTEMPT);
      await new Promise(r => setTimeout(r, attempt * 900));   // backoff 0,9s lalu 1,8s
      retryNeeded = true;
    } else {
      throw new Error(`Stream terputus: ${upstreamError}`);
    }
  }

  if (!retryNeeded && !firstTokenSeen && !fullText.trim() && !upstreamError && attempt < MAX_ATTEMPT) {
    console.warn('[stream] tak ada token sama sekali — percobaan %d/%d, ulangi', attempt, MAX_ATTEMPT);
    await new Promise(r => setTimeout(r, attempt * 900));
    continue;
  }

  if (retryNeeded) continue;   // percobaan baru — fullText di-reset di awal iterasi
  break;
  }

  addUsage(usageBox.last?.promptTokenCount, usageBox.last?.candidatesTokenCount,
           usageBox.last?.thoughtsTokenCount, usageBox.last?.cachedContentTokenCount);
  {
    const inp = usageBox.last?.promptTokenCount ?? 0;
    const cache = usageBox.last?.cachedContentTokenCount ?? 0;
    const lvlTerkirim = clampThinking(body, MODEL).generationConfig?.thinkingConfig?.thinkingLevel;
    console.info('[tokens] model=%s think=%s%s in=%d (cache %d%%) out=%d thinking=%d',
      MODEL, lvlTerkirim, deps().thinkOverride ? ' (override, cache dilewati)' : '',
      inp, inp ? Math.round((cache / inp) * 100) : 0,
      usageBox.last?.candidatesTokenCount ?? 0, usageBox.last?.thoughtsTokenCount ?? 0);
  }
  return collapseDegenerateLoops(fullText);
}

async function compressChunks(chunks: string[], userQuery: string): Promise<string[]> {
  // Extraction balance: buang narasi, sisakan konteks (section/notes) — compress terlalu agresif = jawaban monoton.
  const SYS = 'Ekstraktor presisi dokumen teknis Hitachi. Aturan:\n- Quote VERBATIM (tidak paraphrase).\n- JANGAN ubah, bulatkan, atau format-ulang angka/PN/unit — salin karakter PERSIS (245 tetap 245, 24.5 MPa tetap 24.5 MPa, YB60000068 utuh). Mengubah 1 digit = data rusak.\n- Chunk berisi PROSEDUR/langkah troubleshooting/tabel troubleshooting → salin SEMUA langkah & SEMUA baris penyebab UTUH, jangan diringkas/di-skip/digabung — langkah yang hilang di sini tidak bisa dipulihkan lagi.\n- Ambil baris yg jawab QUERY + 1-2 baris context terkait (mis. section name, service code note, related component) supaya jawaban kontekstual bukan raw data dump.\n- Pertahankan format: backtick PN/spec, tabel row utuh.\n- Drop: image caption, page reference, doc footer.\n- Tidak ada relevan → return string kosong.';

  // Cap chunk yg dikirim ke INTENT_MODEL — context window flash-lite ~8K input.
  const MAX_CHUNK_FOR_COMPRESS = 8000;

  const buildPrompt = (chunk: string) => {
    const safeChunk = chunk.length > MAX_CHUNK_FOR_COMPRESS
      ? chunk.slice(0, MAX_CHUNK_FOR_COMPRESS) + '\n[...truncated]'
      : chunk;
    return `QUERY: "${userQuery}"\n\nCHUNK:\n${safeChunk}\n\nOUTPUT (verbatim excerpts + minimal context, no preamble; prosedur/troubleshooting: SEMUA langkah utuh, selain itu max 250 kata):`;
  };

  const compressOne = async (chunk: string): Promise<string> => {
    if (chunk.length < 500) return chunk; // skip small — sudah compact
    try {
      const res = await callProxy({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(chunk) }] }],
        systemInstruction: { parts: [{ text: SYS }] },
        generationConfig: { maxOutputTokens: 600, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
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

function extractRelatedPCodes(content: string, searchTerms: string[]): string[] {
  const lines = content.split('\n');
  const pCodes: string[] = [];
  // Capture base P-code (P\d{4}); suffix di-strip — ilike '%P0340%' tetap match 'P0340-04'/'P0340/4'.
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

/** A non-empty return BLOCKS the answer. Return '' to let it through. */
function ragErrorTemplate(errorMsg: string): string {
  if (errorMsg.toLowerCase().includes('rerank')) return '';
  // Embedding / Supabase error: benar-benar tidak ada data → jangan jawab.
  return `Sistem pencarian data sedang mengalami gangguan sementara. Jawaban ditahan dulu untuk menghindari informasi yang keliru.\n\nCoba kirim ulang pertanyaanmu dalam beberapa saat.`;
}

const isRerankError = (msg?: string): boolean => !!msg && msg.toLowerCase().includes('rerank');

/** Disisipkan ke user-turn saat rerank gagal — AI wajib menyampaikannya ke teknisi. */
const RERANK_DEGRADED_NOTE =
  '\n\n[PERINGATAN SISTEM — WAJIB DISAMPAIKAN] Mesin pemeringkat (reranker) sedang tidak bisa dihubungi, '
  + 'kemungkinan kena batas pemakaian. Data manual di bawah TETAP ASLI dan boleh dipakai, tapi URUTANNYA '
  + 'belum tersaring — chunk paling relevan bisa saja tidak di urutan pertama. '
  + 'BUKA jawabanmu dengan satu kalimat singkat yang memberi tahu hal ini, lalu jawab seperti biasa. '
  + 'Ingatkan sekali agar angka/PN penting diverifikasi ke manual. JANGAN mengarang untuk menutupi kekurangan urutan.';

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

Alternatif: cek Parts Catalog fisik unit, atau konfirmasi ke Parts Counter dengan menyebut model + nama komponen.`;
}

const KIT_QUERY_RE = /\bkit\b/i;
const KIT_HINT =
  '[PETUNJUK KIT] User mencari seal kit / repair kit. Di katalog Hitachi, kit sering TIDAK punya ' +
  'satu PN bundel — komponennya ditandai `svc:K`. Aturan: (1) kalau ADA baris bernama "KIT" dengan ' +
  'PN tunggal di data, sajikan itu. (2) kalau TIDAK ada baris kit-bundel, JANGAN jawab "tidak ada" — ' +
  'kumpulkan SEMUA part `svc:K` di section paling relevan, sajikan sebagai komponen penyusun kit ' +
  '(PN + nama + qty apa adanya), lalu jelaskan singkat katalog tak mencantumkan satu PN kit-bundel. ' +
  'HARAM mengarang PN kit yang tidak ada di data.';

// Low-confidence & no-result jalur NL teknis → fallback web (bukan canned) — tetap anti-halu angka unit.

const JP_CHARS_RE = /[぀-ヿ一-鿿]/;
const EN_HINT_RE  = /\b(what|who|whose|how|why|when|where|which|can|could|do|does|did|is|are|was|were|please|tell|the)\b/i;
const ID_HINT_RE  = /\b(apa|siapa|kenapa|gimana|bagaimana|kapan|dimana|yang|itu|ini|nggak|ngga|tidak|bisa|tolong|kamu|aku|saya)\b/i;

const SUPPORTED_MODELS = ['ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G', 'KCM 60ZV', 'ZW140'] as const;
// Pola model alat berat generik: ZX350-7G, ZX210LC, PC200-8, EX1200, SK200, CAT320, WA380…
const OTHER_MODEL_RE = /\b(?:ZX|ZW|EX|PC|SK|CAT|WA|D|ZAXIS[\s-]?)\s?\d{2,4}\s?[A-Z]{0,4}(?:-\d[A-Z]?)?\b/i;

/** Model lain yang disebut user (bukan unit aktif & bukan model yang didukung). */
function detectForeignModel(query: string, activeModel: string): string | null {
  const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
  const active = norm(activeModel);
  for (const m of query.matchAll(new RegExp(OTHER_MODEL_RE.source, 'gi'))) {
    const hit = m[0].trim();
    const n = norm(hit);
    if (n === active || active.includes(n) || n.includes(active)) continue;   // unit aktif
    if (SUPPORTED_MODELS.some(s => norm(s) === n)) return hit;                 // didukung, tapi belum dipilih
    if (/\d{2,}/.test(n)) return hit;                                          // model lain sama sekali
  }
  return null;
}

function foreignModelTemplate(foreign: string, activeModel: string): string {
  const supported = SUPPORTED_MODELS.some(s => s.toUpperCase().replace(/[\s-]/g, '') === foreign.toUpperCase().replace(/[\s-]/g, ''));
  return supported
    ? `Pertanyaan kamu soal **${foreign}**, tapi chat ini di-set ke **${activeModel}** 😅\n\nGanti dulu unitnya di menu sebelah kiri ke ${foreign}, baru aku bisa jawab dari manual unit itu.\n\nAda yang mau dicek di ${activeModel}?`
    : `Waduh, manual **${foreign}** belum ada di sistemku 😅 Aku cuma pegang data unit: ${SUPPORTED_MODELS.join(', ')}.\n\nAku ngga bisa bantu diagnosa unit itu — jawabanku harus dari manual resmi, bukan kira-kira.\n\nAda yang mau dicek di **${activeModel}**?`;
}

function offTopicTemplate(query = ''): string {
  if (JP_CHARS_RE.test(query)) {
    return `すみません、その質問は対応範囲外です😅
ユニットに関すること — フォルトコード、トラブルシューティング、スペック、パーツ — ならお答えできます。

何かユニットで確認したいことはありますか？`;
  }
  if (EN_HINT_RE.test(query) && !ID_HINT_RE.test(query)) {
    return `Sorry, that one's out of my lane 😅
I can help with anything about your unit — fault codes, troubleshooting, specs, or parts.

Anything on the unit I can check for you?`;
  }
  return `Waduh, pertanyaan kamu out of topic 😅.
Maaf aku ngga bisa jawab, kamu bisa tanya seputar unit, fault code, troubleshooting, spec, atau parts.

Apa ada yang bisa aku bantu cek?`;
}

const FAULT_CODE_PATTERN = /(?:[A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}(?:-[0-9A-F]{1,4})?)/i;

// ─── Konstanta ────────────────────────────────────────────────────────────────

const RAG_LABEL = {
  manual: 'DATA MANUAL TERSEDIA',
  parts:  'DATA PARTS CATALOG TERSEDIA',
} as const;

const FALLBACK_RESPONSE = 'Maaf, sistem tidak bisa memproses permintaan ini.';

const EXTERNAL_DIRECTIVE = (model: string): string =>
  `[SUMBER EKSTERNAL] Manual internal ${model} tidak memuat data spesifik untuk pertanyaan ini. Jawab profesional memakai prinsip teknik umum + hasil penelusuran web. ATURAN WAJIB:
- Sampaikan sekali di awal, natural: jawaban ini rujukan umum industri, bukan dari manual resmi ${model}.
- Angka eksekusi-kritis (torque, tekanan, PN, clearance, fault code) DILARANG diklaim sebagai spec resmi unit. Kalau memberi angka, tandai sebagai "kisaran umum" dan minta verifikasi ke manual fisik unit.
- Fokus: prinsip kerja, alur diagnosa sistematis, penyebab probable, praktik standar industri.
- Ringkas, actionable, register rekan teknisi. Jangan menyalin mentah hasil web — sintesiskan.`;

// ─── Tipe routing ──────────────────────────────────────────────────────────────

/** Discriminated union — hasil routing RAG sebelum AI dipanggil */
type RagRouteResult =
  | { type: 'rag_found';  content: string; dataLabel: string; confidence?: 'high' | 'medium' | 'low'; rerankDegraded?: boolean }
  | { type: 'rag_canned'; text: string }   // bypass AI, kirim teks langsung
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

const EMBEDDED_FAULT_CODE_RE = /\b([A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}-[0-9A-F]{1,4})\b/i;

function detectFaultCodeInQuery(trimmed: string): { isFaultCode: boolean; faultQuery: string } {
  const looksLike    = new RegExp(`^${FAULT_CODE_PATTERN.source}$`, 'i').test(trimmed);
  const embeddedCode = !looksLike
    ? trimmed.match(EMBEDDED_FAULT_CODE_RE)?.[1]?.trim()
    : undefined;
  return { isFaultCode: looksLike || !!embeddedCode, faultQuery: embeddedCode ?? trimmed };
}

/** 2nd-pass: enrichment ENGINE MANUAL via P-code dari TM result. Non-fatal (TM tetap dikembalikan). */
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
  return {
    type: 'rag_found', content: augmented, dataLabel: RAG_LABEL.manual,
    rerankDegraded: isRerankError(ragResult.ragError),
  };
}

const SERVICE_INTERVAL_RE = /\b(\d{3,5})\s*(?:jam|hm|h(?:our)?r?|hours?)\b/i;

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
  precomputedOpt?: string,
): Promise<RagRouteResult> {
  const hasLiteralPN = !!extractPartNumber(trimmed);
  const isLongQuery  = trimmed.split(/\s+/).length >= 4;
  let searchQuery    = trimmed;
  let usedOptimized  = false;

  const intervalMatch = !hasLiteralPN && trimmed.match(SERVICE_INTERVAL_RE);
  if (intervalMatch) {
    searchQuery = `${intervalMatch[1]} hour service maintenance schedule parts`;
  } else if (!hasLiteralPN && (precomputedOpt !== undefined || isLongQuery)) {
    const opt = precomputedOpt !== undefined
      ? precomputedOpt
      : (await analyzeIntent(trimmed, history, model)).optimizedQuery;
    const optWords = opt?.trim().split(/\s+/).length ?? 0;
    if (opt && opt !== trimmed && optWords >= 3) {
      searchQuery = opt;
      usedOptimized = true;   // → skipExpand: query sudah English, expandQuery malah distorsi
    }
  }

  emit({ type: 'tool_call', tool: 'search_parts_catalog' });
  const ragResult = intervalMatch
    ? await searchServiceIntervalParts(searchQuery, model)
    : await searchPartsCatalog(searchQuery, model, usedOptimized);
  emit({ type: 'tool_result', tool: 'search_parts_catalog', found: ragResult.hasResults });

  if (!ragResult.hasResults) {
    if (MODELS_WITHOUT_PARTS_CATALOG.has(model)) {
      const wmResult = await searchTechnicalManualMulti([trimmed], model, 3, 'WORKSHOP MANUAL');
      if (wmResult.hasResults) {
        const note = `[CATATAN: Parts Catalog ${model} belum lengkap. Info di bawah dari Workshop Manual — PN mungkin disebut inline tapi tidak terstruktur. Sampaikan dgn bahasa lapangan (JANGAN pakai kata "ter-ingest"/"knowledge base"), minta cocokkan ke katalog fisik.]\n\n`;
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
      const cpmPNs = partsList.split('\n')
        .map(l => l.split('|')[0].trim())
        .filter(pn => pn.length >= 4);
      // Substring match → toleran suffix promo (4630525 ↔ 4630525HPB). Hanya baris ber-"Promo: Rp".
      const promoLines = [...new Set(
        ragResult.content.split('\n')
          .map(l => l.trim())
          .filter(l => /Promo:\s*Rp/i.test(l) && cpmPNs.some(pn => l.includes(pn))),
      )];
      const periodeLine = (ragResult.content.match(/Periode Promo\s*:[^\n]*/i) || [null])[0];

      const cpmHeader = `⚠️ PARTS WAJIB GANTI ${hours} JAM (CPM resmi Hitachi):\n${partsList}\n\nGunakan PERSIS PN di atas. JANGAN substitusi dengan PN lain dari training.`;

      finalContent = promoLines.length > 0
        ? `${cpmHeader}\n\n--- HARGA PROMO (khusus PN di atas) ---\n${[periodeLine, ...promoLines].filter(Boolean).join('\n')}`
        : cpmHeader;
    }
  } else if (KIT_QUERY_RE.test(trimmed) && /svc:K/i.test(finalContent)) {
    // Kit-query & data punya komponen svc:K → injeksi petunjuk deterministik (lihat KIT_HINT).
    finalContent = `${KIT_HINT}\n\n${finalContent}`;
  }

  return { type: 'rag_found', content: finalContent, dataLabel: RAG_LABEL.parts };
}

// Whole-message match only. A wrong entry here answers a technical question with zero data.
const CASUAL_EXACT = new Set([
  'halo', 'hallo', 'hai', 'hi', 'hei', 'hey', 'helo',
  'pagi', 'siang', 'sore', 'malam',
  'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam',
  'assalamualaikum', 'salam',
  'ok', 'oke', 'okay', 'okey', 'oks', 'sip', 'siap', 'oke siap', 'siap komandan',
  'mantap', 'mantul', 'keren', 'bagus', 'nice', 'good',
  'makasih', 'makasi', 'terima kasih', 'terimakasih', 'trims', 'tengkyu',
  'thanks', 'thank you', 'thx', 'tq',
  'ya', 'iya', 'yoi', 'betul', 'benar', 'baik', 'noted', 'paham', 'ngerti',
  'oke makasih', 'ok thanks', 'oke terima kasih', 'siap makasih',
  'bye', 'dadah', 'sampai jumpa',
]);

/** Normalisasi untuk pencocokan sapaan: huruf kecil, buang tanda baca & emoji, rapikan spasi. */
function normalizeCasual(s: string): string {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')   // tanda baca & emoji → spasi
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveNaturalLanguageQuery(
  trimmed: string,
  history: Message[],
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  // Jalan pintas deterministik — nol panggilan LLM untuk sapaan/ucapan singkat.
  if (CASUAL_EXACT.has(normalizeCasual(trimmed))) {
    console.info('[intent] sapaan terdeteksi deterministik — analyzeIntent dilewati');
    return { type: 'google_search', mode: 'casual' };
  }

  const intent = await analyzeIntent(trimmed, history, model);
  if (intent.searchType === 'off_topic') return { type: 'rag_canned', text: offTopicTemplate(trimmed) };
  if (!intent.shouldSearch) return { type: 'google_search', mode: 'casual' };

  if (intent.searchType === 'parts') {
    return resolvePartsQuery(trimmed, history, model, emit, intent.optimizedQuery);
  }

  // Technical: guard juga untuk query pendek
  const rawOpt = intent.optimizedQuery?.trim() ?? '';
  const query  = stripModelFromQuery(rawOpt.split(/\s+/).length >= 2 ? rawOpt : trimmed);
  emit({ type: 'tool_call', tool: 'search_technical_manual' });
  // HyDE nonaktif — miss/low langsung ke fallback web. hydeExpand() masih ada kalau mau dihidupkan.
  let ragResult = await searchTechnicalManualMulti([query], model);
  emit({ type: 'tool_result', tool: 'search_technical_manual', found: ragResult.hasResults });

  if (ragResult.ragError) {
    const errMsg = ragErrorTemplate(ragResult.ragError);
    if (errMsg) return { type: 'rag_canned', text: errMsg };
  }

  if (!ragResult.hasResults) return { type: 'google_search', mode: 'technical' };
  if (ragResult.confidence === 'low') return { type: 'google_search', mode: 'technical' };

  // Compression = langkah flash-lite lossy & serial sebelum jawaban → hanya untuk konten jumbo.
  const totalBefore = ragResult.content.length;
  const skipCompress = ragResult.confidence === 'high' || totalBefore < 9000;

  if (skipCompress) {
    console.info('[compress] skip (confidence=%s totalChars=%d)', ragResult.confidence, totalBefore);
    return {
      type: 'rag_found',
      content: ragResult.content,
      dataLabel: RAG_LABEL.manual,
      confidence: ragResult.confidence,
      rerankDegraded: isRerankError(ragResult.ragError),
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
    rerankDegraded: isRerankError(ragResult.ragError),
  };
}


const MULTI_CONNECTOR_RE = /\b(?:dan|plus|sambil|bersamaan|juga|sekaligus|lalu|kemudian|serta)\b|[+&]/i;
// \w* di akhir grup → toleran sufiks Indonesia (beratnya/diameternya/panjangnya).
const MULTI_TECH_RE = /\b(?:berat|weight|diameter|panjang|length|lebar|width|tinggi|height|tebal|thickness|ukuran|size|tekanan|pressure|torque|torsi|clearance|displacement|capacity|kapasitas|rpm|spec|stroke|bore|pn|part\s*number|partnumber|harga|price|promo|motor|pump|valve|cylinder|silinder|filter|seal|gasket|bearing|rotor|stator|pin|bushing|shaft|swing|boom|arm|bucket|blade|track|engine|mesin|hydraulic|hidrolik|sensor|relay|solenoid|controller|alternator|starter|nozzle|injector|turbo|radiator|coupling|reduction|gear)\w*/i;
// Atribut/permintaan terukur — buat deteksi follow-up pendek multi-atribut ("berat dan diameternya").
const MULTI_ATTR_RE = /\b(?:berat|weight|diameter|panjang|length|lebar|width|tinggi|height|tebal|thickness|tekanan|pressure|torque|torsi|clearance|displacement|kapasitas|capacity|rpm|harga|price|part\s*number|partnumber|pn|spec|ukuran|size)\w*/gi;

// Gejala/keluhan (bukan lookup angka). Dipakai HANYA untuk memilih thinking level:
// diagnosa butuh penalaran bertahap, lookup spec tidak. Salah tebak = jawaban lebih lambat
// atau lebih dangkal, tidak pernah salah data.
const GEJALA_RE = new RegExp(
  '\\b(?:kenapa|mengapa|kok|koq|gimana|bagaimana|masalah|kendala|trouble|problem|gangguan|' +
  'bocor|kebocoran|leak|panas|overheat|macet|stuck|lemah|lemas|weak|lambat|slow|drop|turun|' +
  'getar|getaran|vibrasi|vibration|aus|rusak|kerusakan|error|gagal|fail|mati|kendur|slack|' +
  'bunyi|berisik|noise|abnormal|tidak\\s+(?:mau|bisa|naik|jalan|keluar|nyala|hidup)|' +
  'nggak\\s+(?:mau|bisa|naik|jalan|keluar|nyala|hidup)|ga\\s+(?:mau|bisa)|susah|berat\\s+sekali)\\b',
  'i',
);

function isDiagnosisQuery(q: string): boolean {
  return GEJALA_RE.test(q);
}

function isMultiAspectQuery(q: string): boolean {
  if (!MULTI_CONNECTOR_RE.test(q)) return false;
  if (!MULTI_TECH_RE.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean).length;
  const attrCount = (q.match(MULTI_ATTR_RE) ?? []).length;
  // ≥5 kata (query penuh) ATAU ≥2 atribut terukur (follow-up pendek "berat dan diameternya").
  return words >= 5 || attrCount >= 2;
}

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

const GROUNDING_SPEC_RE = /(\d+(?:[.,]\d+)?)\s*(N·?m|Nm|MPa|kPa|bar|psi|kgf?|mm|cm|rpm|°C|kW|HP|L\b|Ω|μm)\b/gi;
function normalizeNum(s: string): string {
  return s.replace(/,/g, '.').replace(/^0+(\d)/, '$1');
}
function verifyGrounding(answer: string, context: string): void {
  if (!context || !answer) return;
  const ctxNums = new Set((context.match(/\d+(?:[.,]\d+)?/g) ?? []).map(normalizeNum));
  const ungrounded: string[] = [];
  let total = 0;
  for (const m of answer.matchAll(GROUNDING_SPEC_RE)) {
    total++;
    if (!ctxNums.has(normalizeNum(m[1]))) ungrounded.push(m[0].trim());
  }
  if (total > 0 && ungrounded.length > 0) {
    console.warn('[grounding] %d/%d angka spec TIDAK ditemukan di data:', ungrounded.length, total, ungrounded.slice(0, 10));
  }
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
  resetUsage(); // mulai akumulasi token untuk 1 pertanyaan (cost ledger)
  // Progress indicator — single-pass juga emit "thinking/tool_call" utk UI (dulu cuma agentic).
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});

  // Sanitize input (anti prompt-injection): cap 4000 char + blokir instruction markers.
  const sanitized = userInput
    .slice(0, 4000)
    .replace(/\[(?:SYSTEM|INSTRUCTION|NEW\s+INSTRUCTION|OVERRIDE|IGNORE\s+PREVIOUS)[^\]]*\]/gi, '[blocked]')
    .replace(/<\|[^|]*\|>/g, '[blocked]'); // ChatML-style tokens
  const trimmed  = sanitized.trim();

  const contents = historyToContents(history, 20);

  emit({ type: 'thinking', message: 'Menganalisa query…' });

  const foreignModel = detectForeignModel(trimmed, model);
  if (foreignModel) {
    console.info('[scope] model asing terdeteksi: %s (aktif: %s)', foreignModel, model);
    return streamCanned(foreignModelTemplate(foreignModel, model), onChunk);
  }

  const { isFaultCode, faultQuery } = detectFaultCodeInQuery(trimmed);

  const hasServiceInterval = !isFaultCode && SERVICE_INTERVAL_RE.test(trimmed);

  // Multi-aspek dicek SEBELUM parts-routing — cegah "diameter X dan PN Y" nyangkut di parts saja.
  const routeResult = isFaultCode
    ? await resolveFaultCodeQuery(faultQuery, model, emit)
    : isMultiAspectQuery(trimmed)
      ? await resolveMultiAspectQuery(trimmed, history, model, emit)
      : (isPartsQuery(trimmed) || hasServiceInterval)
        ? await resolvePartsQuery(trimmed, history, model, emit)
        : await resolveNaturalLanguageQuery(trimmed, history, model, emit);

  if (routeResult.type === 'rag_canned') return streamCanned(routeResult.text, onChunk);

  const gsTechnical      = routeResult.type === 'google_search' && routeResult.mode === 'technical';
  const ragContent       = routeResult.type === 'rag_found'
    ? routeResult.content
        .replace(/Hitachi\s+Astrea\s*/gi, '')
        .replace(/\{?(mm|cm|m)\}?\^([23])\b/g, (_, u: string, d: string) => u + (d === '2' ? '²' : '³'))
    : '';
  const dataLabel        = routeResult.type === 'rag_found' ? routeResult.dataLabel : '';
  const ragConfidence    = routeResult.type === 'rag_found' ? routeResult.confidence : undefined;
  // Casual tidak menerima data manual → prompt ringkas.
  const isCasual = routeResult.type === 'google_search' && routeResult.mode === 'casual';
  // Diukur 16 Agu 2026: medium → low memangkas waktu-ke-huruf-pertama 19,6 → 5,6 dtk (token
  // thinking dihasilkan SELURUHNYA sebelum satu huruf pun keluar). Jadi low untuk lookup —
  // fault code, parts, spec — yang jawabannya tinggal disusun dari data. Diagnosa gejala tetap
  // medium: di situ penalaran bertahap yang menentukan mutu, dan lambatnya terbayar.
  const isDiagnosis = !isFaultCode && !isCasual && isDiagnosisQuery(trimmed);
  const thinkingLevel: ThinkingLevel = isDiagnosis ? 'medium' : 'low';
  const maxOutputTokens  = ragContent ? 4096 : gsTechnical ? 2048 : 1536;
  const rerankDegraded = routeResult.type === 'rag_found' && routeResult.rerankDegraded === true;
  const caveat = rerankDegraded
    ? RERANK_DEGRADED_NOTE
    : ragConfidence === 'medium'
      ? `\n\n[CONFIDENCE: MEDIUM — data relevan tapi mungkin bukan match persis. Jangan ngarang detail. Reminder verifikasi natural & sekali saja, hanya untuk angka/PN kritis yang langsung dieksekusi; JANGAN stempel kalimat template "verifikasi ke manual fisik" di tiap jawaban.]`
      : '';
  if (rerankDegraded) console.warn('[rerank] gagal — jawaban ditandai degraded ke teknisi');
  const userText         = ragContent
    ? `${trimmed || 'Halo'}${caveat}\n\n[${dataLabel}]\n${ragContent}`
    : gsTechnical
      ? `${trimmed}\n\n${EXTERNAL_DIRECTIVE(model)}`
      : (trimmed || 'Halo');

  // Timestamp di user-turn (BUKAN system prompt) — SYSTEM_PROMPT wajib byte-identical utk prompt-cache hit.
  contents.push({ role: 'user', parts: [{ text: `[${jakartaTime()} WIB]\n${userText}` }] });

  const systemText = isCasual
    ? SYSTEM_PROMPT_CASUAL(model, userName)
    : SYSTEM_PROMPT(model, userName);

  // Google Search grounding HANYA untuk fallback web-teknis. Casual (sapaan/ack) murni LLM → instan.
  const fullText = await callProxyStream({
    contents,
    systemInstruction: { parts: [{ text: systemText }] },
    generationConfig:  { maxOutputTokens, temperature: 0.3, thinkingConfig: { thinkingLevel } },
  }, onChunk, gsTechnical);

  // Cache jawaban tinggal di klien (hit = nol round-trip); server cuma menandai boleh/tidaknya.
  if (routeResult.type === 'rag_found' && fullText && !fullText.includes(STREAM_CUT_NOTE.trim())) {
    deps().meta.cacheable = true;
  }

  // Anti-halu telemetri — cek angka spec di jawaban benar bersumber dari data.
  if (ragContent && fullText) verifyGrounding(fullText, ragContent);

  return fullText || FALLBACK_RESPONSE;
}


export type { AgentEvent } from './react-agent';

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
  attachments?: InlineImage[],
  onChunk?: (text: string) => void,
  onAgentEvent?: (event: import('./react-agent').AgentEvent) => void,
): Promise<string> {
  resetUsage(); // mulai akumulasi token untuk 1 pertanyaan (cost ledger)
  // Progress indicator — jalur foto paling lambat (OCR → search → 2nd-pass → generate).
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});
  const systemInstruction = SYSTEM_PROMPT(model, userName);
  const contents: VContent[] = historyToContents(history);
  const currentParts: Part[] = [];

  if (attachments && attachments.length > 0) {
    emit({ type: 'thinking', message: 'Membaca foto…' });
    const imageParts = attachments
      .filter(a => a?.mimeType && a?.data)
      .map(toInlineData);
    if (imageParts.length === 0) return 'Maaf, gagal membaca file gambar.';
// Photo reaches the model only when OCR fails - otherwise it is sent twice (~1064 wasted tokens).
    let sendImageToModel = true;

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
        const perCodeTopN = faultCodes.length >= 3 ? 2 : 3;
        const settled = await Promise.allSettled(
          faultCodes.map(async code => {
            const terms = extractSearchTerms(code);
            let result = await searchTechnicalManualMulti(terms, model, perCodeTopN);
            let content = result.content;

            // 2nd-pass: P-code hanya dari baris relevan (extractRelatedPCodes) — cegah 20+ embed calls.
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

        // Instruksi eksplisit: jelaskan SETIAP kode dgn heading terpisah (bukan footnote kode lain).
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

        // Kode terbaca DAN datanya ketemu di manual → foto tidak perlu dikirim ulang.
        sendImageToModel = false;
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

    if (sendImageToModel) currentParts.unshift(...imageParts);

    // Timestamp di user-turn (BUKAN system prompt) — part terpisah, tak ganggu urutan image/text.
    contents.push({ role: 'user', parts: [{ text: `[${jakartaTime()} WIB]` }, ...currentParts] });

    emit({ type: 'thinking', message: 'Menyusun diagnosis…' });

    const body: VRequest = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        maxOutputTokens: sendImageToModel ? 8192 : 4096,
        temperature: 0.3,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    };

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
