import { deps } from './deps';
import { UNIT_MODELS } from './types';

// Per-request client, JWT-scoped.
const sb = () => deps().supabase as any;



interface SearchResult {
  content: string;
  metadata: any;
  similarity: number;
}


const VECTOR_SIMILARITY_THRESHOLD = 0.30;
// Latency lever.
const RERANK_INPUT_CAP = 30;
/** Must exceed topN, else MMR has no choice. */
const RERANK_RETURN_N = 10;
// Coarse gate.
const VECTOR_MATCH_COUNT = 20;
// Payload guard.
const RERANK_PAYLOAD_BUDGET_CHARS = 500_000;

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
const embeddingInFlight = new Map<string, Promise<number[]>>();

function setCached(key: string, value: number[]) {
  // True LRU.
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
  embeddingCache.delete(key);
  embeddingCache.set(key, entry);
  return entry.values;
}

function isFaultCode(query: string): boolean {
  return /^(?:[A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}(?:-[0-9A-F]{1,4})?)$/i.test(query.trim());
}

const PARTS_KEYWORDS_RE = /\b(part\s*number|part\s*no\.?|p\/?n[\s:]+\w|spare\s*part|suku\s*cadang|nomor\s*part|kode\s*part|harga\s*part|katalog\s*part|parts?\s*catalog|cross[-\s]?ref(?:erence)?|kompatibel|compatibility|substitu(?:te|si)|pengganti\s*part)\b/i;

// Price queries.
const HARGA_COMPONENT_RE = /\b(?:harga|price)\s+(?:promo\s+)?(?:seal|kit|pump|valve|motor|cylinder|filter|gasket|bearing|o-?ring|element|hose|sensor|coupling|grease|oil|coolant|breaker|controller|reman|rotor|piston|spring|nozzle|injector|alternator|starter|battery|belt|fan|radiator|shaft)\b/i;

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
    // Spacing variants.
    const spaced   = trimmed.replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1: $2');
    const unspaced = trimmed.replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1:$2');
    const numOnly  = trimmed.replace(/^[A-Z]{1,3}\s*:?\s*/i, '');
    // Stripped variant.
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

/** Singular/plural match. */
function batangKata(w: string): string {
  if (w.length < 6) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'i';
  if (w.endsWith('y'))   return w.slice(0, -1);
  if (w.endsWith('es'))  return w.slice(0, -2);
  if (w.endsWith('s'))   return w.slice(0, -1);
  return w;
}

interface RerankedDoc { content: string; score: number }
interface RerankResult { docs: RerankedDoc[]; error?: string }

const RERANK_DOC_CAP = 2500;

async function rerankWithCohere(query: string, docs: string[], topN: number): Promise<RerankResult> {
  if (docs.length === 0) return { docs: [] };

  // Scores map back to full text.
  const scoringDocs = docs.map(d => d.length > RERANK_DOC_CAP ? d.slice(0, RERANK_DOC_CAP) : d);

  try {
    const out = await deps().rerank(query, scoringDocs, topN);
    if (out.error) throw new Error(out.error);
    const ranked = out.results
      .map(r => ({ content: docs[r.index], score: r.score }))
      .filter((d): d is RerankedDoc => typeof d.content === 'string');
    return { docs: ranked };
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    const errMsg = msg.includes('abort') ? 'Rerank timeout (8s)' : `Rerank error: ${msg}`;
    console.warn('Cohere rerank failed:', errMsg);
    // Neutral score.
    return { docs: docs.slice(0, topN).map(content => ({ content, score: 0.5 })), error: errMsg };
  }
}

function computeConfidence(scored: RerankedDoc[]): { confidence: 'high' | 'medium' | 'low'; topScore: number } {
  const topScore = scored[0]?.score ?? 0;
  if (topScore >= 0.45) return { confidence: 'high', topScore };
  if (topScore >= 0.25) return { confidence: 'medium', topScore };
  return { confidence: 'low', topScore };
}

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
  const selected = [pool.shift()!];  // Seed.
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


// Derived from UNIT_MODELS.
const MODEL_NAMES_RE = new RegExp(
  '\\b(' + UNIT_MODELS
    .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|') + ')(?:-\\w+)?\\b\\s*',
  'gi',
);

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => `\\${m}`);
}

export function stripModelFromQuery(query: string): string {
  return query.replace(MODEL_NAMES_RE, '').replace(/\s+/g, ' ').trim();
}

const EXPAND: Record<string, string> = {
  // Indonesian -> English
  hidrolik: 'hydraulic', hidraulik: 'hydraulic', pompa: 'pump',
  katup: 'valve', silinder: 'cylinder', tangki: 'tank', selang: 'hose',
  akumulator: 'accumulator', tekanan: 'pressure', aliran: 'flow',
  mesin: 'engine', turbo: 'turbocharger', injektor: 'injector',
  nosel: 'nozzle', kompresi: 'compression',
  solar: 'diesel fuel', bahan: 'fuel', urea: 'DEF urea',
  aki: 'battery', starter: 'starter motor', sekring: 'fuse',
  kabel: 'wiring harness', bantalan: 'bearing',
  sepatu: 'shoe track', final: 'final drive', travel: 'travel motor',
  bocor: 'leak', kebocoran: 'leak', panas: 'overheat', macet: 'stuck',
  tersumbat: 'clogged', lemah: 'weak power', lambat: 'slow response',
  getaran: 'vibration', aus: 'wear', rusak: 'failure', kerusakan: 'failure',
  kendur: 'slack', mati: 'not working',
  oli: 'oil', minyak: 'oil', pendingin: 'coolant', gemuk: 'grease',
  kapasitas: 'capacity', celah: 'clearance', toleransi: 'tolerance',
  spesifikasi: 'specification', kalibrasi: 'calibration',
  suhu: 'temperature', temperatur: 'temperature', putaran: 'rpm rotation',
  torsi: 'torque', kecepatan: 'speed',
  perawatan: 'maintenance', servis: 'service',
  sistem: 'system', kopling: 'clutch', rem: 'brake', rantai: 'chain',
  // Field shorthand
  cyl: 'cylinder', cyls: 'cylinders', cilinder: 'cylinder',
  kit: 'assembly o-ring',   // 'kit assembly seal' → hapus 'kit' dari value
  seal: 'o-ring gasket',    // 'seal o-ring' → hapus 'seal' dari value
  asm: 'assembly', assy: 'assembly',
  pn: 'part number', nomor: 'number part',
  isi: 'capacity refill',
  cek: 'check inspect',
  jadwal: 'schedule maintenance interval',
  relief: 'valve pressure MPa',          // hapus 'relief'
  displacement: 'cm3 rev motor',         // hapus 'displacement'
};


// Not expanded, still technical.
const TECH_TERMS = new Set([
  ...Object.keys(EXPAND),
  ...Object.values(EXPAND).flatMap(v => v.split(' ')),
  'bucket', 'arm', 'boom', 'blade', 'dozer', 'pump', 'main', 'pilot',
  'control', 'spool', 'port', 'cylinder', 'valve', 'primary', 'piston',
]);

const STOP_WORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'ada', 'apa', 'bagaimana',
  'kenapa', 'mengapa', 'cara', 'tolong', 'bantu', 'mohon', 'dengan', 'untuk',
  'pada', 'dalam', 'oleh', 'atau', 'juga', 'sudah', 'bisa', 'tidak', 'apakah',
  'akan', 'saya', 'unit', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'how', 'what', 'why', 'when', 'where', 'please', 'help', 'tell', 'me', 'about',
]);

const NUMERIC_INTENT_RE = /\b(berapa|nilai|standar|standard|spesifikasi|spec|minimum|minimal|maksimum|maksimal|normal|batas|limit|toleransi|range)\b/i;

const SPEC_TERMS = new Set([
  'weight', 'berat', 'torque', 'torsi', 'pressure', 'tekanan', 'clearance',
  'displacement', 'capacity', 'kapasitas', 'rpm', 'voltage', 'tegangan',
  'resistance', 'flow', 'dimension', 'dimensi', 'gap', 'speed',
  // Dimensions.
  'diameter', 'dia', 'length', 'panjang', 'width', 'lebar', 'height', 'tinggi',
  'thickness', 'tebal', 'size', 'ukuran', 'stroke', 'depth', 'bore',
]);

function expandQuery(query: string): string {
  // Max 3, deduped.
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
  let values = await deps().embed(safeQuery);
  if (!Array.isArray(values) || values.length === 0) throw new Error('Embed returned no values');
  values = values.map(v => Math.round(v * 1e6) / 1e6);
  setCached(cacheKey, values);
  return values;
}

/** LRU + in-flight dedup. */
export async function getEmbedding(query: string): Promise<number[]> {
  const cacheKey = query.toLowerCase().replace(/\s+/g, ' ').trim();

  const cached = getCachedLru(cacheKey);
  if (cached) return cached;

  // Dedup concurrent fetches.
  const inFlight = embeddingInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = fetchEmbedding(query, cacheKey).finally(() => {
    embeddingInFlight.delete(cacheKey);
  });
  embeddingInFlight.set(cacheKey, promise);
  return promise;
}


interface RAGResult {
  content: string;
  hasResults: boolean;
  ragError?: string;  // Caller must surface.
  confidence?: 'high' | 'medium' | 'low'; // Adaptive retrieval confidence dari rerank score distribution
  topScore?: number;  // Telemetry.
}

const TROUBLESHOOTING_KATEGORI_BY_MODEL: Record<string, string> = {
  'ZX200-5G': 'TROUBLESHOOTING',
  'KCM 60ZV': 'WORKSHOP MANUAL',
  'ZW140': 'TROUBLESHOOTING',
};
const DEFAULT_TROUBLESHOOTING_KATEGORI = 'TECHNICAL MANUAL';

function getTroubleshootingKategori(model: string): string {
  return TROUBLESHOOTING_KATEGORI_BY_MODEL[model] ?? DEFAULT_TROUBLESHOOTING_KATEGORI;
}

export async function searchTechnicalManualMulti(
  queries: string[],
  model: string,
  topN = 4,  // Final chunks.
  forceKategori?: string,  // Routing override.
): Promise<RAGResult> {
  if (!sb() || queries.length === 0) return { content: '', hasResults: false };

  const tMulai = Date.now();
  const primaryQuery = queries[0].trim();
  const faultCode    = isFaultCode(primaryQuery);
  // Explicit wins.
  const strictFilter = forceKategori
    ? { Model: model, Kategori: forceKategori }
    : faultCode
      ? { Model: model, Kategori: getTroubleshootingKategori(model) }
      : { Model: model };
  const looseFilter  = { Model: model };

  const normalizedQueries = queries.map(q =>
    faultCode
      ? q.trim().replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1: $2')
      : q.trim(),
  );

  const kwPromises = faultCode
    ? normalizedQueries.map(sq =>
        sb().from('documents').select('content, metadata')
          .ilike('content', `%${escapeLike(sq)}%`)
          .contains('metadata', strictFilter)
          .limit(5),
      )
    : [];

  const wantsNumericAnswer =
    primaryQuery.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^\w°·/-]/g, ''))
      .some(w => SPEC_TERMS.has(w))
    || NUMERIC_INTENT_RE.test(primaryQuery);

  // Ranked keyword.
  const rankedPromise: Promise<string[]> = (async () => {
    if (faultCode) return [];
    const words = primaryQuery.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^\w°·/-]/g, ''))
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (words.length === 0) return [];
// Bigrams matter.
    // Stem: 'capacity' misses 'Capacities'.
    const stems = words.map(batangKata);
    const bigrams = stems.slice(0, -1).map((w, i) => `${w} ${stems[i + 1]}`);
    // Full phrase stays whole.
    const frasaPenuh = primaryQuery.toLowerCase().trim().split(/\s+/).map(batangKata).join(' ');
    const terms = [...new Set([frasaPenuh, ...bigrams, ...stems])].slice(0, 7);
    // Numeric bonus.
    const wantsNumber = wantsNumericAnswer;

    const { data, error } = await sb().rpc('match_documents_keyword_ranked', {
// Term count is the cost.
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
      sb().from('documents').select('content')
        .ilike('content', `%${escapeLike(comp)}%`)
        .ilike('content', `%${escapeLike(specWord)}%`)
        .contains('metadata', strictFilter)
        .limit(5)));
    return res.flatMap(r => r.status === 'fulfilled'
      ? (r.value.data ?? []).map((d: { content?: string }) => d?.content).filter((c: unknown): c is string => !!c)
      : []);
  });

  const stripped = stripModelFromQuery(primaryQuery);
  const embeddingQuery = stripped.split(/\s+/).filter(Boolean).length >= 2
    ? stripped
    : primaryQuery;

  // Parallel with keyword.
  // Fault code: literal filter drops anything keyword can't find — embed is pure waste (quota 5/min).
  const vectorPromise: Promise<SearchResult[]> = faultCode
    ? Promise.resolve([])
    : getEmbedding(embeddingQuery).then(async emb => {
    let { data: vecData } = await sb().rpc('match_documents', {
      query_embedding: emb, match_count: VECTOR_MATCH_COUNT, filter: strictFilter,
    });
    if (faultCode && (!Array.isArray(vecData) || vecData.length === 0)) {
      const { data: vecFallback } = await sb().rpc('match_documents', {
        query_embedding: emb, match_count: VECTOR_MATCH_COUNT, filter: looseFilter,
      });
      vecData = vecFallback;
    }
    const hasil = (Array.isArray(vecData) ? (vecData as SearchResult[]) : [])
      .filter(d => typeof d?.similarity === 'number' && d.similarity >= VECTOR_SIMILARITY_THRESHOLD);
    // Vector arm logged separately.
    console.info('[vektor] %d hasil, sim %s..%s | atas: %s',
      hasil.length,
      hasil[0]?.similarity?.toFixed(3) ?? '-',
      hasil[hasil.length - 1]?.similarity?.toFixed(3) ?? '-',
      hasil.slice(0, 3).map(d => d.content.split('\n').filter(Boolean)[0]?.slice(0, 42)).join(' | '));
    return hasil;
  });

  const [kwSettled, rankedSettled, vectorSettled] = await Promise.allSettled([
    Promise.allSettled(kwPromises),
    rankedPromise,
    vectorPromise,
  ]);
  const msCari = Date.now() - tMulai;

// Interleave, never keyword-first.
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

  // Loose fallback -> caveat.
  let usedLooseFallback = false;
  if (faultCode && allDocs.length === 0) {
    const fbPromises = normalizedQueries.map(sq =>
      sb().from('documents').select('content, metadata')
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

  let filteredDocs = allDocs;
  if (faultCode) {
    const codeUpper = primaryQuery.toUpperCase();
    const numOnly   = codeUpper.replace(/^[A-Z]{1,3}\s*:?\s*/i, '');
    const stripped  = numOnly.replace(/-0+([0-9A-Fa-f]+)$/, '-$1'); // "13006-02" → "13006-2"
    filteredDocs = allDocs.filter(text => {
      const upper = text.toUpperCase();
      if (upper.includes(codeUpper)) return true;
      if (numOnly.length >= 4 && upper.includes(numOnly)) return true;
      // Stripped variant.
      if (stripped !== numOnly && stripped.length >= 4 && upper.includes(stripped)) return true;
      return false;
    });
  }

  if (filteredDocs.length === 0) {
    // Both arms failed.
    const embedFailed = vectorSettled.status === 'rejected';
    if (embedFailed && allDocs.length === 0) {
      const reason = (vectorSettled.reason as Error)?.message ?? 'Embedding service error';
      return { content: '', hasResults: false, ragError: reason };
    }
    return { content: '', hasResults: false };
  }

  // Bounded payload.
  const rerankInput = capRerankPayload(filteredDocs);
  const rerankPool = Math.min(rerankInput.length, RERANK_RETURN_N);
  const tRerank = Date.now();
  const { docs: reranked, error: rerankErr } = await rerankWithCohere(primaryQuery, rerankInput, rerankPool);
  const msRerank = Date.now() - tRerank;
  // MMR keeps top[0] first.
  let top = mmrSelect(reranked, topN, 0.7);

  // Guarantees top 2, not just #1.
  const KW_DIJAMIN = 2;
  if (wantsNumericAnswer && rankedSettled.status === 'fulfilled' && top.length > 0) {
    const kandidat = rankedSettled.value
      .slice(0, KW_DIJAMIN)
      .filter(c => c && !top.some(t => t.content === c));
    if (kandidat.length > 0) {
      // top[0] sets tier.
      top = [top[0], ...kandidat.map(c => ({ content: c, score: top[0].score })), ...top.slice(1)]
        .slice(0, topN);
      console.info('[jaminan-keyword] %d chunk disisipkan', kandidat.length);
    }
  }

  const { confidence, topScore } = computeConfidence(top);

  const effectiveConfidence = (usedLooseFallback || rerankErr) && confidence === 'high'
    ? 'medium'
    : confidence;

  // Effective tier, not raw.
  const alasanTurun = rerankErr ? ' (rerank GAGAL — skor semu)' : usedLooseFallback ? ' (loose filter)' : '';
  console.info('[confidence] tm tier=%s%s topScore=%s pool=%d→%d (MMR) | cari=%dms rerank=%dms',
    effectiveConfidence, alasanTurun, topScore.toFixed(2), reranked.length, top.length, msCari, msRerank);

  // What actually reached Gemini.
  console.info('[chunks] %s', top.map((t, i) =>
    `#${i + 1}(${t.score.toFixed(2)}) ${t.content.split('\n').filter(Boolean).slice(0, 3).join(' / ').slice(0, 90)}`
  ).join('  ||  '));
  // No rank prefix.
  const content = top.map(t => t.content).join('\n\n---\n\n');
  return { content, hasResults: true, confidence: effectiveConfidence, topScore, ...(rerankErr ? { ragError: rerankErr } : {}) };
}

const ENGINE_MANUAL_MODELS = new Set(['ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G']);

/** P-code 2nd pass. */
export async function searchEngineManual(
  pCodes: string[],
  model: string,
  topN = 2,
): Promise<RAGResult> {
  if (!sb() || !ENGINE_MANUAL_MODELS.has(model) || pCodes.length === 0) {
    return { content: '', hasResults: false };
  }

  const filter = { Model: model, Kategori: 'ENGINE MANUAL' };
  const seen = new Set<string>();
  const allDocs: string[] = [];

  const kwSettled = await Promise.allSettled(
    pCodes.map(pCode =>
      sb().from('documents').select('content')
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

  const { docs: top, error: rerankErr } = await rerankWithCohere(pCodes[0], capRerankPayload(allDocs), topN);
  const { confidence, topScore } = computeConfidence(top);
  // Rerank failed -> downgrade.
  const effectiveConfidence = rerankErr && confidence === 'high' ? 'medium' : confidence;
  console.info('[confidence] em tier=%s%s topScore=%s pool=%d',
    effectiveConfidence, rerankErr ? ' (rerank GAGAL — skor semu)' : '', topScore.toFixed(2), top.length);
  return {
    content: top.map(t => t.content).join('\n\n---\n\n'),  // strip [Rank N] prefix
    hasResults: top.length > 0,
    confidence: effectiveConfidence,
    topScore,
    ...(rerankErr ? { ragError: rerankErr } : {}),
  };
}

const ACTIVE_PROMO_KATEGORI = ['PROMO Q2 FY2026'] as const;

type PromoChunk = { content: string; similarity?: number; match_type?: string };

function promoSectionKey(content: string): string {
  const m = content.match(/PROMO\s+Q\d\s+FY\d+\s*-\s*([^\n(]+)/i);
  return (m ? m[1] : '').trim().toUpperCase();
}

// Old -> new order.
function preferNewestPromo(byPeriod: PromoChunk[][]): PromoChunk[] {
  const out: PromoChunk[] = [];
  const seen = new Set<string>();
  for (let i = byPeriod.length - 1; i >= 0; i--) {  // Newest first.
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

const ENGINE_PN_RE = /^(?:\d{10}|[A-Z]{2,3}\d{5,8}-\d{4,6}|[A-Z]{2,3}\d{10,12})$/i;

const ENGINE_CATALOG_MODELS = new Set(['ZX200-5G', 'ZX48U-5A', 'KCM 60ZV']);

export const MODELS_WITHOUT_PARTS_CATALOG = new Set(['ZX65USB-5A', 'ZX138MF-5G']);

export async function searchServiceIntervalParts(
  query: string,
  model: string,
): Promise<RAGResult> {
  if (!sb()) return { content: '', hasResults: false };

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

  const cpmPromise = sb().rpc('match_documents_hybrid', {
    query_text: queryText,
    query_embedding: embedding,
    match_count: 1,
    filter: { Model: model, Kategori: 'CPM' },
    similarity_threshold: 0.20,  // Threshold longgar — CPM 1 chunk only, harus selalu masuk
  }) as unknown as Promise<{ data: HybridResult[] | null }>;

  const promoPromises = ACTIVE_PROMO_KATEGORI.map(kat =>
    sb().rpc('match_documents_hybrid', {
      query_text: queryText,
      query_embedding: embedding,
      match_count: 5,
      filter: { Model: model, Kategori: kat },
      similarity_threshold: 0.25,
    }) as unknown as Promise<{ data: HybridResult[] | null }>,
  );

  const [cpmRes, ...promoSettled] = await Promise.allSettled([cpmPromise, ...promoPromises]);

  const cpmData = cpmRes.status === 'fulfilled' && Array.isArray(cpmRes.value.data) ? cpmRes.value.data : [];
  // Prefer newest.
  const promoByPeriod: HybridResult[][] = promoSettled.map(r =>
    r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data : [],
  );
  const promoData: HybridResult[] = preferNewestPromo(promoByPeriod);

  if (cpmData.length === 0 && promoData.length === 0) {
    return { content: '', hasResults: false };
  }

  const all = [...cpmData, ...promoData];
  return {
    content: all.map(d => d.content).join('\n\n---\n\n'),
    hasResults: true,
  };
}

export async function searchPartsCatalog(
  query: string,
  model: string,
  skipExpand = false,   // true kalau query sudah AI-optimized English (skip expandQuery)
): Promise<RAGResult> {
  if (!sb()) return { content: '', hasResults: false };

  const partNum = extractPartNumber(query);
  const isEnginePN = !!partNum && ENGINE_PN_RE.test(partNum);

  // PN needs context.
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

  const hasEngineCatalog = ENGINE_CATALOG_MODELS.has(model);

  const bodyCount = (isEnginePN && hasEngineCatalog) ? 3 : 7;     // was 2/5
  const engineCount = isEnginePN ? 5 : 3;
  const promoCount = 5;                                           // was 3
  const cpmCount = 1;

  // Strip model name.
  const queryText = stripModelFromQuery(query.trim());

  // Indexed per category.
  const PARTS_IDX = 0;
  const CPM_IDX   = 1;
  const PROMO_START_IDX = 2;
  const PROMO_END_IDX   = PROMO_START_IDX + ACTIVE_PROMO_KATEGORI.length;
  const ENGINE_IDX = hasEngineCatalog ? PROMO_END_IDX : -1;

  const queries: Promise<{ data: HybridResult[] | null }>[] = [
    sb().rpc('match_documents_hybrid', {
      query_text: queryText,
      query_embedding: embedding,
      match_count: bodyCount,
      filter: { Model: model, Kategori: 'PARTS CATALOG' },
      similarity_threshold: 0.28,
    }) as unknown as Promise<{ data: HybridResult[] | null }>,
    sb().rpc('match_documents_hybrid', {
      query_text: queryText,
      query_embedding: embedding,
      match_count: cpmCount,
      filter: { Model: model, Kategori: 'CPM' },
      similarity_threshold: 0.30,
    }) as unknown as Promise<{ data: HybridResult[] | null }>,
  ];

  // Lower threshold.
  for (const promoKat of ACTIVE_PROMO_KATEGORI) {
    queries.push(
      sb().rpc('match_documents_hybrid', {
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
      sb().rpc('match_documents_hybrid', {
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
  const promoByPeriod: HybridResult[][] = [];
  for (let i = PROMO_START_IDX; i < PROMO_END_IDX; i++) {
    promoByPeriod.push(getData(i));
  }
  const promoData: HybridResult[] = preferNewestPromo(promoByPeriod);
  const engineData: HybridResult[] = ENGINE_IDX >= 0 ? getData(ENGINE_IDX) : [];

  // Hybrid RPC fallback.
  if (bodyData.length === 0 && engineData.length === 0 && promoData.length === 0 && cpmData.length === 0) {
    const fallbackQueries = [
      sb().rpc('match_documents', {
        query_embedding: embedding, match_count: 5,
        filter: { Model: model, Kategori: 'PARTS CATALOG' },
      }),
    ];
    if (hasEngineCatalog) {
      fallbackQueries.push(
        sb().rpc('match_documents', {
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
    // Never high.
    return {
      content: allFallback.map(d => d.content).join('\n\n---\n\n'),
      hasResults: true,
      confidence: 'medium',
    };
  }

  const nonCpm = [...bodyData, ...engineData, ...promoData];
  nonCpm.sort((a, b) => {
    const aExact = a.match_type === 'exact_part_no' ? 1 : 0;
    const bExact = b.match_type === 'exact_part_no' ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });

  let orderedNonCpm = nonCpm;
  let rerankTopScore = 0;
  let rerankDipakai  = false;
  if (!partNum && nonCpm.length > 3) {
    const exact = nonCpm.filter(d => d.match_type === 'exact_part_no');
    const rest  = nonCpm.filter(d => d.match_type !== 'exact_part_no');
    if (rest.length > 3) {
      const rerankDocs = capRerankPayload(rest.map(d => d.content));
      const rerankRest = rest.slice(0, rerankDocs.length);
      const { docs: reranked, error } = await rerankWithCohere(
        queryText,
        rerankDocs,
        Math.min(rerankRest.length, 12),
      );
      if (!error && reranked.length > 0) {
        rerankTopScore = reranked[0].score;
        rerankDipakai  = true;
        // Avoid near-duplicates.
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

  // Literal PN required.
  if (partNum) {
    const pnUpper = partNum.toUpperCase();
    const adaLiteral = merged.some(d =>
      d.match_type === 'exact_part_no' || (d.content ?? '').toUpperCase().includes(pnUpper));
    if (!adaLiteral) {
      console.warn('[parts] PN %s TIDAK ada literal di %d kandidat — menolak menyodorkan part mirip',
        partNum, merged.length);
      return { content: '', hasResults: false };
    }
  }

  const top = merged.slice(0, 12);
  if (top.length === 0) return { content: '', hasResults: false };

  // Parts confidence.
  const partsConfidence: 'high' | 'medium' | 'low' = partNum
    ? 'high'
    : rerankDipakai
      ? computeConfidence([{ content: '', score: rerankTopScore }]).confidence
      : 'medium';

  console.info('[parts] cpm=%d body=%d engine=%d promo=%d → top=%d | tier=%s%s',
    cpmData.length, bodyData.length, engineData.length, promoData.length, top.length,
    partsConfidence, partNum ? ' (PN literal terbukti)' : rerankDipakai ? '' : ' (tanpa rerank)');

  return {
    content: top.map(d => d.content).join('\n\n---\n\n'),
    hasResults: true,
    confidence: partsConfidence,
    ...(rerankDipakai ? { topScore: rerankTopScore } : {}),
  };
}
