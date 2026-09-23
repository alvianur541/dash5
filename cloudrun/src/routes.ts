import { UnitModel, Message, AgentEvent, UNIT_MODELS } from './types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, extractPartNumber, searchPartsCatalog, searchServiceIntervalParts, stripModelFromQuery, MODELS_WITHOUT_PARTS_CATALOG, findPerformanceStandard, extractCatalogCode, isFaultCode } from './rag';
import { modelHasSource } from './constants';
import { Part, VContent, InlineDataPart, callProxy, getText, INTENT_MODEL } from './vertex';
import { analyzeIntent, decomposeAspects, classifyAspect } from './intent';
import { ragErrorTemplate, faultCodeNotFoundTemplate, partsNotFoundTemplate, offTopicTemplate, sessionLang, KIT_HINT, KIT_QUERY_RE, RAG_LABEL } from './templates';
import type { Lang } from './templates';

export type AgentEventEmit = (event: AgentEvent) => void;

const HISTORY_FULL_TAIL   = 4;
const HISTORY_RECENT_CAP  = 3500;
const HISTORY_OLD_CAP     = 700;
const HISTORY_BUDGET_CHAR = 14000;
const KEY_LINE_RE = /\b(?:[A-Z]{1,3}\d{5,}|\d{7,}|YA\d{6,}|\d+(?:[.,]\d+)?\s?(?:MPa|kPa|bar|psi|V|A|Ω|mm|L|jam|°C|rpm|Nm|kgf))\b|kesimpulan|penyebab|kemungkinan|solusi|rekomendasi|langkah pertama|tidak tercantum|\bPN\b|part number/i;
const TABLE_LINE_RE = /^\s*\|/;

function condenseOld(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^[-=*_]{3,}$/.test(l) && !/^\|?\s*:?-{2,}/.test(l))
    .map(l => TABLE_LINE_RE.test(l) ? l.split('|').map(c => c.trim()).filter(Boolean).join(' · ') : l)
    .filter(l => !TABLE_LINE_RE.test(l) || KEY_LINE_RE.test(l));
  const keep: string[] = [];
  let used = 0;
  const push = (l: string) => {
    const clean = l.replace(/^#+\s*/, '').replace(/\*\*/g, '');
    if (used + clean.length + 1 > cap) return false;
    keep.push(clean); used += clean.length + 1; return true;
  };
  for (const l of lines) if (KEY_LINE_RE.test(l) && !push(l)) break;
  for (const l of lines) if (!KEY_LINE_RE.test(l) && !keep.includes(l.replace(/^#+\s*/, '').replace(/\*\*/g, '')) && !push(l)) break;
  if (keep.length === 0) return text.slice(0, cap) + '…';
  return keep.join('\n') + '\n…[ringkasan pesan lama]';
}

export function historyToContents(history: Message[], window = 20): VContent[] {
  const recent = history.slice(-window).filter(m => m.content?.trim());
  const tailStart = Math.max(0, recent.length - HISTORY_FULL_TAIL);
  const out = recent.map((m, i) => {
    const raw = m.content;
    const text = i >= tailStart
      ? (raw.length > HISTORY_RECENT_CAP ? condenseOld(raw, HISTORY_RECENT_CAP) : raw)
      : (m.role === 'user' ? raw.slice(0, HISTORY_OLD_CAP) : condenseOld(raw, HISTORY_OLD_CAP));
    return { role: m.role === 'user' ? 'user' : 'model', text };
  });
  let total = out.reduce((s, c) => s + c.text.length, 0);
  while (total > HISTORY_BUDGET_CHAR && out.length > 2) {
    const dropped = out.shift()!;
    total -= dropped.text.length;
    if (out[0]?.role === 'model') { total -= out[0].text.length; out.shift(); }
  }
  return out.map(c => ({ role: c.role as 'user' | 'model', parts: [{ text: c.text }] as Part[] }));
}

export async function extractFaultCodes(imageParts: InlineDataPart[]): Promise<string[]> {
  const SYS_PROMPT = `OCR fault code specialist untuk Hitachi/KCM heavy equipment monitor display.
Format output: 1 baris, comma-separated codes, atau "NONE".

Rules:
- Include letter prefix kalau visible (ENG:, W:, CA, dll). Contoh: "ENG:00436-04, W:1208, CA2769"
- Suffix \`-XX\` di-include kalau visible (mis. \`13006-02\`)
- Tidak ada kode visible → "NONE"
- Duplikat kode di image → list sekali saja
- Ragu/tidak yakin baca → SKIP kode itu (better miss daripada salah baca)
- Bukan fault code (mis. operating hour, tanggal, time) → JANGAN include
- Layar Air Conditioner / A/C menampilkan kode angka 1-2 digit (mis. 51) → tulis dengan awalan AC:, contoh "AC:51"`;

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

export async function extractImageFacts(imageParts: InlineDataPart[]): Promise<{ pns: string[]; component: string }> {
  const SYS_PROMPT = `Baca foto komponen/area alat berat Hitachi/KCM untuk pencarian katalog.
Output TEPAT 2 baris:
PN: <SEMUA part number / kode part yang tercetak jelas (label, nameplate, atau daftar/estimasi part), dipisah koma, maks 15, atau NONE>
COMPONENT: <nama komponen/area yang tampak, bahasa Inggris istilah parts catalog, 2-6 kata; beberapa komponen berbeda → maks 4 dipisah koma; atau NONE>
- PN hanya yang berlabel P/N, PART NO, atau jelas berformat part number (mis. YA00002098, 4651654), termasuk kode oli/pelumas/coolant (mis. HTCDH1C, HAPDH1P) dan kode bersufiks (mis. 4249339-F, YA00006560HP). JANGAN tulis serial number, tanggal, barcode, fault code, harga, qty, atau nomor yang ragu dibaca.
- COMPONENT contoh: "hydraulic main pump regulator", "fuse relay box controller", "swing motor", "piston, connecting rod, main bearing, injection pump". Foto bukan komponen alat berat → NONE.`;
  const res = await callProxy({
    contents: [{ role: 'user', parts: [...imageParts, { text: 'Isi dua baris PN dan COMPONENT untuk foto ini.' }] }],
    systemInstruction: { parts: [{ text: SYS_PROMPT }] },
    generationConfig: { maxOutputTokens: 400, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
  }, false, INTENT_MODEL);
  const raw = getText(res.candidates?.[0]?.content?.parts ?? []);
  const pnLine = raw.match(/PN:\s*(.*)/i)?.[1]?.trim() ?? '';
  const compLine = raw.match(/COMPONENT:\s*(.*)/i)?.[1]?.trim() ?? '';
  const pns = /^none$/i.test(pnLine) ? [] : pnLine.split(',').map(c => extractCatalogCode(c)).filter((c): c is string => !!c);
  const component = /^none$/i.test(compLine) ? '' : compLine.replace(/[^\p{L}\p{N} ,/-]/gu, '').trim().slice(0, 90);
  return { pns: [...new Set(pns)].slice(0, 15), component };
}

async function compressChunks(chunks: string[], userQuery: string): Promise<string[]> {
  const SYS = 'Ekstraktor presisi dokumen teknis Hitachi. Aturan:\n- Quote VERBATIM (tidak paraphrase).\n- JANGAN ubah, bulatkan, atau format-ulang angka/PN/unit — salin karakter PERSIS (245 tetap 245, 24.5 MPa tetap 24.5 MPa, YB60000068 utuh). Mengubah 1 digit = data rusak.\n- Chunk berisi PROSEDUR/langkah troubleshooting/tabel troubleshooting → salin SEMUA langkah & SEMUA baris penyebab UTUH, jangan diringkas/di-skip/digabung — langkah yang hilang di sini tidak bisa dipulihkan lagi.\n- Ambil baris yg jawab QUERY + 1-2 baris context terkait (mis. section name, service code note, related component) supaya jawaban kontekstual bukan raw data dump.\n- Pertahankan format: backtick PN/spec, tabel row utuh.\n- Drop: image caption, page reference, doc footer.\n- Tidak ada relevan → return string kosong.';

  const MAX_CHUNK_FOR_COMPRESS = 8000;

  const buildPrompt = (chunk: string) => {
    const safeChunk = chunk.length > MAX_CHUNK_FOR_COMPRESS
      ? chunk.slice(0, MAX_CHUNK_FOR_COMPRESS) + '\n[...truncated]'
      : chunk;
    return `QUERY: "${userQuery}"\n\nCHUNK:\n${safeChunk}\n\nOUTPUT (verbatim excerpts + minimal context, no preamble; prosedur/troubleshooting: SEMUA langkah utuh, selain itu max 250 kata):`;
  };

  const compressOne = async (chunk: string): Promise<string> => {
    if (chunk.length < 500) return chunk;
    try {
      const res = await callProxy({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(chunk) }] }],
        systemInstruction: { parts: [{ text: SYS }] },
        generationConfig: { maxOutputTokens: 600, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
      }, false, INTENT_MODEL);
      const compressed = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
      if (compressed.length < 30) return chunk;
      return compressed;
    } catch (err) {
      console.warn('[compressChunks] failed for one chunk, fallback to original:', (err as Error)?.message);
      return chunk;
    }
  };

  const results = await Promise.allSettled(chunks.map(compressOne));
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : chunks[i]);
}

export function extractRelatedPCodes(content: string, searchTerms: string[]): string[] {
  const lines = content.split('\n');
  const pCodes: string[] = [];
  const P_CODE_RE = /\bP\d{4}\b/gi;
  for (const line of lines) {
    const lineUpper = line.toUpperCase();
    const isRelevant = searchTerms.some(t => t.length >= 4 && lineUpper.includes(t.toUpperCase()));
    if (isRelevant) {
      const matches = [...line.matchAll(P_CODE_RE)].map(m => m[0].toUpperCase());
      pCodes.push(...matches);
    }
  }
  return [...new Set(pCodes)].slice(0, 3);
}

const isRerankError = (msg?: string): boolean => !!msg && msg.toLowerCase().includes('rerank');

const OTHER_MODEL_RE = /\b(?:ZX|ZW|EX|PC|SK|CAT|WA|D|ZAXIS[\s-]?)\s?\d{2,4}\s?[A-Z]{0,4}(?:-\d[A-Z]?)?\b/i;

export function detectForeignModel(query: string, activeModel: string): string | null {
  const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
  const active = norm(activeModel);
  for (const m of query.matchAll(new RegExp(OTHER_MODEL_RE.source, 'gi'))) {
    const hit = m[0].trim();
    const n = norm(hit);
    if (n === active || active.includes(n) || n.includes(active)) continue;
    if (UNIT_MODELS.some(s => norm(s) === n)) return hit;
    if (/\d{2,}/.test(n)) return hit;
  }
  return null;
}

export type RagRouteResult =
  | { type: 'rag_found';  content: string; dataLabel: string; confidence?: 'high' | 'medium' | 'low'; rerankDegraded?: boolean }
  | { type: 'rag_canned'; text: string }
  | { type: 'google_search'; mode: 'casual' | 'technical' };

export function streamCanned(text: string, onChunk: (text: string) => void): string {
  const CHUNK_SIZE = 80;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    onChunk(text.slice(i, i + CHUNK_SIZE));
  }
  return text;
}

const EMBEDDED_FAULT_CODE_RE = /\b([A-Z]{1,3}\s*:?\s*(?:(?=[0-9A-F]*\d)[0-9A-F]{4,6}-[0-9A-F]{1,4}|\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}-[0-9A-F]{1,4})\b/gi;

export function detectFaultCodeInQuery(trimmed: string): { isFaultCode: boolean; faultQuery: string } {
  if (isFaultCode(trimmed)) return { isFaultCode: true, faultQuery: trimmed };
  const embedded = [...trimmed.matchAll(EMBEDDED_FAULT_CODE_RE)].map(m => m[1].trim()).find(isFaultCode);
  return { isFaultCode: !!embedded, faultQuery: embedded ?? trimmed };
}

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

export async function resolveFaultCodeQuery(
  faultQuery: string,
  model: UnitModel,
  emit: AgentEventEmit = () => {},
  lang: Lang = 'id',
): Promise<RagRouteResult> {
  emit({ type: 'tool_call', tool: 'search_technical_manual' });
  const ragResult = await searchTechnicalManualMulti(extractSearchTerms(faultQuery), model);
  emit({ type: 'tool_result', tool: 'search_technical_manual', found: ragResult.hasResults });

  if (ragResult.ragError) {
    const errMsg = ragErrorTemplate(ragResult.ragError, lang);
    if (errMsg) return { type: 'rag_canned', text: errMsg };
  }

  if (!ragResult.hasResults) {
    return { type: 'rag_canned', text: faultCodeNotFoundTemplate(faultQuery, model, lang) };
  }

  const augmented = await augmentWithEngineManual(ragResult.content, faultQuery, model, emit);
  return {
    type: 'rag_found', content: augmented, dataLabel: RAG_LABEL.manual,
    rerankDegraded: isRerankError(ragResult.ragError),
  };
}

export const SERVICE_INTERVAL_RE = /\b(\d{3,5})\s*(?:jam|hm|h(?:our)?r?|hours?)\b|\b(?:servis|service|maintenance|perawatan|pm|paket|pket|pkt)\s+(\d{3,5})\b/i;

export function extractCpmPartsForInterval(content: string, hours: number): string {
  const lines = content.split('\n');

  const headerLine = lines.find(l => /\b500hr\b/.test(l) && /\b1000hr\b/.test(l));
  if (!headerLine) return '';

  const intervals = Array.from(headerLine.matchAll(/(\d+)hr/g), m => parseInt(m[1]));
  const colIdx = intervals.indexOf(hours);
  if (colIdx < 0) return '';

  const parts: string[] = [];

  const qtyCount = intervals.length;
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.trim().split(/\s{2,}/);
    if (fields.length < qtyCount + 2) continue;
    if (!/^\d+$/.test(fields[0])) continue;

    const vals = fields.slice(fields.length - qtyCount);
    if (!vals.every(v => v === '-' || /^\d+$/.test(v))) continue;
    const head = fields.slice(1, fields.length - qtyCount);
    let desc: string, pn: string;
    if (head.length >= 2) {
      desc = head[0];
      pn   = head.slice(1).join(' ');
    } else {
      const toks = head[0].split(/\s+/);
      pn   = toks.pop() ?? '';
      desc = toks.join(' ');
    }
    const qty = vals[colIdx];
    if (!qty || qty === '-') continue;

    parts.push(`${pn} | ${desc} | qty:${qty}`);
  }

  return parts.join('\n');
}

export const REDO_RE = /\b(?:cek|coba|cb|cari)\s*(?:lagi|lg|ulang)\b|\bcoba\s+cari\b|\blebih\s+(?:dalam|detail|teliti)\b/i;

const REFERS_BACK_RE =/\b(?:ini|itu|tsb|tersebut|tadi|td|di\s*atas|d\s*atas|yg\s*d\w*|yang\s+di|sesuai|semua|smua|lagi|lg|list\w*|daftar\w*)\b/i;

// Price rows carry two Rp amounts; the older dump labelled them "Promo: Rp", the newer one does not.
export const isPromoPriceLine = (line: string): boolean =>
  line.includes('|') && (line.match(/Rp\s?[\d.]{3,}/g) ?? []).length >= 2;

export async function resolvePartsQuery(
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

  const intervalOf = (s?: string) => { const m = s?.match(SERVICE_INTERVAL_RE); return m ? (m[1] ?? m[2]) : null; };
  const intervalHours = hasLiteralPN ? null : (intervalOf(trimmed) ?? intervalOf(precomputedOpt));
  if (intervalHours) {
    searchQuery = `${intervalHours} hour service maintenance schedule parts`;
  } else if (!hasLiteralPN && (precomputedOpt !== undefined || isLongQuery)) {
    const opt = precomputedOpt !== undefined
      ? precomputedOpt
      : (await analyzeIntent(trimmed, history)).optimizedQuery;
    const optWords = opt?.trim().split(/\s+/).length ?? 0;
    if (opt && opt !== trimmed && optWords >= 3) {
      searchQuery = opt;
      usedOptimized = true;
    }
  }

  const prevAnswer = REFERS_BACK_RE.test(trimmed)
    ? ([...history].reverse().find(m => m.role !== 'user')?.content ?? '')
        .split('\n').filter(l => !l.trim().startsWith('|')).join('\n').slice(0, 800)
    : '';
  emit({ type: 'tool_call', tool: 'search_parts_catalog' });
  const ragResult = intervalHours
    ? await searchServiceIntervalParts(searchQuery, model)
    : await searchPartsCatalog(searchQuery, model, usedOptimized, 12, `${trimmed}\n${prevAnswer}`);
  emit({ type: 'tool_result', tool: 'search_parts_catalog', found: ragResult.hasResults });

  if (!ragResult.hasResults) {
    if (MODELS_WITHOUT_PARTS_CATALOG.has(model)) {
      const wmResult = await searchTechnicalManualMulti([trimmed], model, 3, 'WORKSHOP MANUAL');
      if (wmResult.hasResults) {
        const note = `[CATATAN: Parts Catalog ${model} belum lengkap. Info di bawah dari Workshop Manual — PN mungkin disebut inline tapi tidak terstruktur. Sampaikan dgn bahasa lapangan (JANGAN pakai kata "ter-ingest"/"knowledge base"), minta cocokkan ke katalog fisik.]\n\n`;
        return { type: 'rag_found', content: note + wmResult.content, dataLabel: RAG_LABEL.parts, confidence: wmResult.confidence };
      }
    }
    return { type: 'rag_canned', text: partsNotFoundTemplate(extractPartNumber(trimmed) ?? trimmed, model, sessionLang(trimmed, history)) };
  }

  let finalContent = ragResult.content;
  if (intervalHours) {
    const hours    = parseInt(intervalHours);
    const partsList = extractCpmPartsForInterval(ragResult.content, hours);
    if (partsList) {
      const cpmPNs = partsList.split('\n')
        .map(l => l.split('|')[0].trim())
        .filter(pn => pn.length >= 4);
      const promoLines = [...new Set(
        ragResult.content.split('\n')
          .map(l => l.trim())
          .filter(l => isPromoPriceLine(l) && cpmPNs.some(pn => l.includes(pn))),
      )];
      const periodeLines = [...new Set(
        Array.from(ragResult.content.matchAll(/Periode Promo\s*:[^\n]*/gi), m => m[0].trim()),
      )];

      const cpmHeader = `⚠️ PARTS WAJIB GANTI ${hours} JAM (Periodic Maintenance):\n${partsList}\n\nGunakan PERSIS PN di atas. JANGAN substitusi dengan PN lain dari training.`;

      finalContent = promoLines.length > 0
        ? `${cpmHeader}\n\n--- HARGA PROMO (khusus PN di atas) ---\n${[...periodeLines, ...promoLines].join('\n')}`
        : cpmHeader;
    } else {
      finalContent = ragResult.content.split('\n\n---\n\n').slice(0, 6).join('\n\n---\n\n');
    }
  } else if (KIT_QUERY_RE.test(trimmed) && /svc:K/i.test(finalContent)) {
    finalContent = `${KIT_HINT}\n\n${finalContent}`;
  }

  return { type: 'rag_found', content: finalContent, dataLabel: RAG_LABEL.parts };
}

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
  'test', 'tes', 'tets', 'testing', 'tes tes', 'test test', 'cek', 'cek cek', 'ping', 'p', 'halo halo', 'coba', 'tes dulu', 'test dulu',
]);

export function isCasualExact(s: string): boolean { return CASUAL_EXACT.has(normalizeCasual(s)); }

function normalizeCasual(s: string): string {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DOC_KATEGORI: Array<[RegExp, string[]]> = [
  [/\bbro(?:s|a|ch)?u?re?\b/i, ['BROSUR MANUAL']],
  [/\boperator'?s?\s*manual\b|buku\s+operator/i, ['OPERATOR MANUAL']],
  [/\b(?:workshop|shop)\s*manual\b/i, ['WORKSHOP MANUAL']],
  [/\bengine\s*manual\b/i, ['ENGINE MANUAL']],
  [/operational\s*principle|prinsip\s*kerja/i, ['OPERATIONAL PRINCIPLE']],
  [/circuit\s*diagram|wiring\s*diagram|diagram\s*kelistrikan/i, ['Circuit Diagram', 'HYDRAULIC CIRCUIT DIAGRAM']],
  [/technical\s*news|service\s*bulletin|\bbuletin\b/i, ['TECHNICAL NEWS']],
  [/konsumsi\s*(?:bahan\s*bakar|solar|bbm)|pemakaian\s*(?:solar|bbm|bahan\s*bakar)|fuel\s*consumption|\bliter\s*per\s*jam\b|\bl\/(?:jam|hour|h)\b/i, ['FUEL CONSUMPTION']],
  [/\bsales\s*manual\b/i, ['SALES MANUAL']],
];

export function docKategoriFor(text: string, model: UnitModel): { kategori: string; available: boolean } | null {
  const hit = DOC_KATEGORI.find(([re]) => re.test(text));
  if (!hit) return null;
  const kategori = hit[1].find(k => modelHasSource(model, k)) ?? hit[1][0];
  return { kategori, available: modelHasSource(model, kategori) };
}

export async function resolveNaturalLanguageQuery(
  trimmed: string,
  history: Message[],
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  if (CASUAL_EXACT.has(normalizeCasual(trimmed))) {
    console.info('[intent] sapaan terdeteksi deterministik — analyzeIntent dilewati');
    return { type: 'google_search', mode: 'casual' };
  }

  const intent = await analyzeIntent(trimmed, history);
  if (intent.searchType === 'off_topic') return { type: 'rag_canned', text: offTopicTemplate(trimmed, history) };
  if (!intent.shouldSearch) return { type: 'google_search', mode: 'casual' };

  if (intent.searchType === 'parts') {
    return resolvePartsQuery(trimmed, history, model, emit, intent.optimizedQuery);
  }

  const rawOpt = intent.optimizedQuery?.trim() ?? '';
  const query  = stripModelFromQuery(rawOpt.split(/\s+/).length >= 2 ? rawOpt : trimmed);
  emit({ type: 'tool_call', tool: 'search_technical_manual' });
  const doc = docKategoriFor(trimmed, model);
  let ragResult = doc?.available ? await searchTechnicalManualMulti([query], model, 4, doc.kategori) : null;
  let docNote = '';
  if (doc && (!ragResult || !ragResult.hasResults || ragResult.confidence === 'low')) {
    docNote = doc.available
      ? `[CATATAN: Teknisi minta dicek di ${doc.kategori}. Dokumen itu ADA untuk ${model} tapi tidak memuat topik ini — katakan begitu apa adanya; JANGAN bilang dokumennya tidak ada atau tidak dimuat.]\n\n`
      : `[CATATAN: ${doc.kategori} memang tidak dimuat untuk ${model} — sampaikan itu singkat, lalu jawab dari data di bawah.]\n\n`;
    ragResult = null;
  }
  if (!ragResult) ragResult = await searchTechnicalManualMulti([query], model, REDO_RE.test(trimmed) ? 7 : 4);
  const prevUser = trimmed.split(/\s+/).length < 4 ? ([...history].reverse().find(m => m.role === 'user')?.content ?? '') : '';
  const perf = await findPerformanceStandard(model, `${trimmed} ${query} ${prevUser}`, ragResult.content);
  if (perf) {
    ragResult = {
      ...ragResult,
      content: [perf, ragResult.content].filter(Boolean).join('\n\n---\n\n'),
      hasResults: true,
      confidence: ragResult.hasResults && ragResult.confidence !== 'low' ? ragResult.confidence : 'high',
      ragError: isRerankError(ragResult.ragError) ? ragResult.ragError : undefined,
    };
  }
  if (docNote && ragResult.hasResults) ragResult = { ...ragResult, content: docNote + ragResult.content };
  emit({ type: 'tool_result', tool: 'search_technical_manual', found: ragResult.hasResults });

  if (ragResult.ragError) {
    const errMsg = ragErrorTemplate(ragResult.ragError, sessionLang(trimmed, history));
    if (errMsg) return { type: 'rag_canned', text: errMsg };
  }

  if (!ragResult.hasResults) return { type: 'google_search', mode: 'technical' };
  if (ragResult.confidence === 'low') return { type: 'google_search', mode: 'technical' };

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

const MULTI_ASPECT_TM_TOP    = 3;
const MULTI_ASPECT_PARTS_TOP = 6;

export async function resolveMultiAspectQuery(
  trimmed: string,
  history: Message[],
  model: UnitModel,
  emit: AgentEventEmit = () => {},
): Promise<RagRouteResult> {
  emit({ type: 'thinking', message: 'Memecah query jadi beberapa aspek…' });
  const subs = await decomposeAspects(trimmed, history);
  if (subs.length < 2) return resolveNaturalLanguageQuery(trimmed, history, model, emit);

  emit({ type: 'thinking', message: `Mencari ${subs.length} aspek paralel…` });

  const empty = { content: '', hasResults: false } as const;
  const perAspect = await Promise.all(subs.map(async sub => {
    const kind  = classifyAspect(sub);
    const clean = stripModelFromQuery(sub);
    const wantTm    = kind !== 'parts';
    const wantParts = kind !== 'spec';
    const [tm, parts] = await Promise.all([
      wantTm ? (async () => {
        emit({ type: 'tool_call', tool: 'search_technical_manual' });
        const r = await searchTechnicalManualMulti([clean], model, MULTI_ASPECT_TM_TOP).catch(() => empty);
        emit({ type: 'tool_result', tool: 'search_technical_manual', found: r.hasResults });
        return r;
      })() : Promise.resolve(empty),
      wantParts ? (async () => {
        emit({ type: 'tool_call', tool: 'search_parts_catalog' });
        const r = await searchPartsCatalog(sub, model, true, MULTI_ASPECT_PARTS_TOP).catch(() => empty);
        emit({ type: 'tool_result', tool: 'search_parts_catalog', found: r.hasResults });
        return r;
      })() : Promise.resolve(empty),
    ]);
    return { sub, kind, tm, parts };
  }));

  const seen = new Set<string>();
  const blocks: string[] = [];
  const missing: string[] = [];
  perAspect.forEach((a, idx) => {
    const parts: string[] = [];
    for (const r of [a.tm, a.parts]) {
      if (!r.hasResults || !r.content) continue;
      const fresh = r.content.split('\n\n---\n\n').filter(c => c.trim() && !seen.has(c));
      fresh.forEach(c => seen.add(c));
      if (fresh.length) parts.push(fresh.join('\n\n---\n\n'));
    }
    if (parts.length === 0) { missing.push(a.sub); return; }
    blocks.push(`[ASPEK ${idx + 1}/${subs.length}: ${a.sub}]\n${parts.join('\n\n---\n\n')}`);
  });

  console.info('[multi-aspect] %d aspek (%s) → %d blok, %d chunk unik, %d tanpa data',
    subs.length, perAspect.map(a => a.kind).join('/'), blocks.length, seen.size, missing.length);

  if (blocks.length === 0) return resolveNaturalLanguageQuery(trimmed, history, model, emit);

  const directive =
    `[PERTANYAAN MULTI-ASPEK — ${subs.length} aspek: ${subs.map((s, i) => `(${i + 1}) ${s}`).join(', ')}]\n` +
    `WAJIB jawab SEMUA aspek, satu bagian per aspek dengan heading sendiri, urutan sesuai nomor. ` +
    `Data tiap aspek ada di blok [ASPEK n/${subs.length}]. Aspek yang datanya ada tapi kamu lewati = jawaban tidak lengkap.` +
    (missing.length ? ` Aspek berikut belum ketemu di pencarian ini: ${missing.join('; ')} — katakan singkat belum ketemu (jangan simpulkan manual ${model} tidak memuatnya) dan sarankan satu istilah lain untuk ditanyakan ulang; jangan dikarang.` : '');

  return { type: 'rag_found', content: `${directive}\n\n${blocks.join('\n\n=====\n\n')}`, dataLabel: RAG_LABEL.manual };
}
