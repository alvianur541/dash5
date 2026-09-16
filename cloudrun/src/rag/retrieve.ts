import { deps } from '../deps';
import { getEmbedding } from './embed';
import { RERANK_RETURN_N, capRerankPayload, computeConfidence, mmrSelect, rerankWithCohere } from './rerank';
import { NUMERIC_INTENT_RE, SPEC_TERMS, STOP_WORDS, batangKata, escapeLike, stripModelFromQuery } from './terms';


const META_CACHE_MAX = 500;

const metaByContent = new Map<string, any>();

function rememberMeta(content?: string, metadata?: any): void {
  if (!content || !metadata || metaByContent.has(content)) return;
  if (metaByContent.size >= META_CACHE_MAX) metaByContent.delete(metaByContent.keys().next().value as string);
  metaByContent.set(content, metadata);
}

export function noteChunks(
  kind: string,
  docs: Array<{ content: string; score?: number; metadata?: any }>,
): void {
  const meta = deps().meta;
  if (!meta.chunks) meta.chunks = [];
  for (const d of docs) {
    const md = d.metadata || metaByContent.get(d.content) || {};
    const field = (k: string) =>
      (md[k] ?? '').toString().trim() ||
      (d.content.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '');
    meta.chunks.push({
      kind, model: field('Model'), kategori: field('Kategori'), section: field('Section').slice(0, 120),
      ...(typeof d.score === 'number' ? { score: Number(d.score.toFixed(3)) } : {}),
    });
  }
}

export const sb = () => deps().supabase as any;

export interface SearchResult {
  content: string;
  metadata: any;
  similarity: number;
}

const VECTOR_SIMILARITY_THRESHOLD = 0.30;

const VECTOR_MATCH_COUNT = 20;

export interface RAGResult {
  content: string;
  hasResults: boolean;
  ragError?: string;
  confidence?: 'high' | 'medium' | 'low';
  topScore?: number;
}

interface Candidates {
  kwDocs: string[];
  vecDocs: string[];
  rankedDocs: string[];
  allDocs: string[];
  usedLooseFallback: boolean;
  embedFailed: boolean;
  embedError?: string;
  msCari: number;
}

export function wantsNumeric(primaryQuery: string): boolean {
  return primaryQuery.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^\w°·/-]/g, ''))
      .some(w => SPEC_TERMS.has(w))
    || NUMERIC_INTENT_RE.test(primaryQuery);
}

export async function gatherCandidates(
  queries: string[],
  model: string,
  faultCode: boolean,
  strictFilter: Record<string, string>,
): Promise<Candidates> {
  const tMulai = Date.now();
  const primaryQuery = queries[0].trim();
  const looseFilter: Record<string, string> = { Model: model };

  const normalizedQueries = queries.map(q =>
    faultCode
      ? q.trim().replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1: $2')
      : q.trim(),
  );

  const ilikeAny = (filter: Record<string, string>, limit: number): Promise<{ data: Array<{ content?: string; metadata?: any }> | null }> =>
    sb().from('documents').select('content, metadata')
      .or(normalizedQueries.map(sq => `content.ilike.%${escapeLike(sq)}%`).join(','))
      .contains('metadata', filter)
      .limit(limit);

  const kwPromise = faultCode
    ? ilikeAny(strictFilter, 5 * normalizedQueries.length)
    : Promise.resolve({ data: [] as Array<{ content?: string; metadata?: any }> });

  const wantsNumericAnswer = wantsNumeric(primaryQuery);

  const rankedPromise: Promise<string[]> = (async () => {
    if (faultCode) return [];
    const words = primaryQuery.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^\w°·/-]/g, ''))
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (words.length === 0) return [];
    const stems = words.map(batangKata);
    const bigrams = stems.slice(0, -1).map((w, i) => `${w} ${stems[i + 1]}`);
    const frasaPenuh = primaryQuery.toLowerCase().trim().split(/\s+/).map(batangKata).join(' ');
    const terms = [...new Set([frasaPenuh, ...bigrams, ...stems])].slice(0, 7);
    const wantsNumber = wantsNumericAnswer;

    const { data, error } = await sb().rpc('match_documents_keyword_ranked', {
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

  const vectorPromise: Promise<SearchResult[]> = faultCode
    ? Promise.resolve([])
    : getEmbedding(embeddingQuery).then(async emb => {
    const { data: vecData } = await sb().rpc('match_documents', {
      query_embedding: emb, match_count: VECTOR_MATCH_COUNT, filter: strictFilter,
    });
    const hasil = (Array.isArray(vecData) ? (vecData as SearchResult[]) : [])
      .filter(d => typeof d?.similarity === 'number' && d.similarity >= VECTOR_SIMILARITY_THRESHOLD);
    console.info('[vektor] %d hasil, sim %s..%s | atas: %s',
      hasil.length,
      hasil[0]?.similarity?.toFixed(3) ?? '-',
      hasil[hasil.length - 1]?.similarity?.toFixed(3) ?? '-',
      hasil.slice(0, 3).map(d => d.content.split('\n').filter(Boolean)[0]?.slice(0, 42)).join(' | '));
    return hasil;
  });

  const [kwSettled, rankedSettled, vectorSettled] = await Promise.allSettled([
    kwPromise,
    rankedPromise,
    vectorPromise,
  ]);
  const msCari = Date.now() - tMulai;

  const kwDocs:  string[] = [];
  const vecDocs: string[] = [];
  const rankedDocs: string[] = rankedSettled.status === 'fulfilled' ? rankedSettled.value : [];

  if (rankedSettled.status === 'fulfilled') {
    for (const c of rankedSettled.value) if (c) kwDocs.push(c);
  }

  if (kwSettled.status === 'fulfilled') {
    for (const d of kwSettled.value.data ?? []) if (d?.content) { rememberMeta(d.content, d.metadata); kwDocs.push(d.content); }
  }

  if (vectorSettled.status === 'fulfilled') {
    for (const d of vectorSettled.value) if (d.content) { rememberMeta(d.content, (d as any).metadata); vecDocs.push(d.content); }
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

  let usedLooseFallback = false;
  if (faultCode && allDocs.length === 0) {
    const fb = await ilikeAny(looseFilter, 5 * normalizedQueries.length).then(r => r.data ?? []).catch(() => []);
    for (const d of fb) {
      if (d?.content && !seen.has(d.content)) { rememberMeta(d.content, d.metadata); pushUnik(d.content); usedLooseFallback = true; }
    }
  }

  const embedFailed = vectorSettled.status === 'rejected';
  const embedError = embedFailed ? ((vectorSettled.reason as Error)?.message ?? 'Embedding service error') : undefined;
  return { kwDocs, vecDocs, rankedDocs, allDocs, usedLooseFallback, embedFailed, embedError, msCari };
}

export function filterByFaultCode(docs: string[], primaryQuery: string): string[] {
  const codeUpper = primaryQuery.toUpperCase();
  const numOnly   = codeUpper.replace(/^[A-Z]{1,3}\s*:?\s*/i, '');
  const stripped  = numOnly.replace(/-0+([0-9A-Fa-f]+)$/, '-$1');
  return docs.filter(text => {
    const upper = text.toUpperCase();
    if (upper.includes(codeUpper)) return true;
    if (numOnly.length >= 4 && upper.includes(numOnly)) return true;
    if (stripped !== numOnly && stripped.length >= 4 && upper.includes(stripped)) return true;
    return false;
  });
}

export async function rankAndSelect(
  primaryQuery: string,
  filteredDocs: string[],
  rankedDocs: string[],
  wantsNumericAnswer: boolean,
  usedLooseFallback: boolean,
  topN: number,
  msCari: number,
): Promise<RAGResult> {
  const rerankInput = capRerankPayload(filteredDocs);
  const rerankPool = Math.min(rerankInput.length, RERANK_RETURN_N);
  const tRerank = Date.now();
  const { docs: reranked, error: rerankErr } = await rerankWithCohere(primaryQuery, rerankInput, rerankPool);
  const msRerank = Date.now() - tRerank;
  let top = mmrSelect(reranked, topN, 0.7);

  const KW_DIJAMIN = 2;
  if (wantsNumericAnswer && top.length > 0) {
    const kandidat = rankedDocs
      .slice(0, KW_DIJAMIN)
      .filter(c => c && !top.some(t => t.content === c));
    if (kandidat.length > 0) {
      top = [top[0], ...kandidat.map(c => ({ content: c, score: top[0].score })), ...top.slice(1)]
        .slice(0, topN);
      console.info('[jaminan-keyword] %d chunk disisipkan', kandidat.length);
    }
  }

  const { confidence, topScore } = computeConfidence(top);

  const effectiveConfidence = (usedLooseFallback || rerankErr) && confidence === 'high'
    ? 'medium'
    : confidence;

  const alasanTurun = rerankErr ? ' (rerank GAGAL — skor semu)' : usedLooseFallback ? ' (loose filter)' : '';
  console.info('[confidence] tm tier=%s%s topScore=%s pool=%d→%d (MMR) | cari=%dms rerank=%dms',
    effectiveConfidence, alasanTurun, topScore.toFixed(2), reranked.length, top.length, msCari, msRerank);
  try {
    const m = deps().meta;
    m.msRag = (m.msRag || 0) + msCari;
    m.msRerank = (m.msRerank || 0) + msRerank;
    m.topScore = topScore;
  } catch { /* di luar konteks request */ }

  console.info('[chunks] %s', top.map((t, i) =>
    `#${i + 1}(${t.score.toFixed(2)}) ${t.content.split('\n').filter(Boolean).slice(0, 3).join(' / ').slice(0, 90)}`
  ).join('  ||  '));
  noteChunks('tm', top);
  const content = top.map(t => t.content).join('\n\n---\n\n');
  return { content, hasResults: true, confidence: effectiveConfidence, topScore, ...(rerankErr ? { ragError: rerankErr } : {}) };
}

export type HybridResult = { content: string; similarity?: number; match_type?: string; metadata?: any };

export function hybrid(
  queryText: string, embedding: number[], matchCount: number,
  filter: Record<string, string>, threshold: number,
): Promise<{ data: HybridResult[] | null }> {
  return sb().rpc('match_documents_hybrid', {
    query_text: queryText, query_embedding: embedding, match_count: matchCount,
    filter, similarity_threshold: threshold,
  }) as unknown as Promise<{ data: HybridResult[] | null }>;
}
