import { deps, RerankSource } from '../deps';


const RERANK_INPUT_CAP = 30;

export const RERANK_RETURN_N = 10;

const RERANK_PAYLOAD_BUDGET_CHARS = 500_000;

export function capRerankPayload(docs: string[]): string[] {
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

interface RerankedDoc { content: string; score: number }

interface RerankResult { docs: RerankedDoc[]; error?: string; source?: RerankSource }

const RERANK_DOC_CAP = 2500;

export async function rerankDocs(query: string, docs: string[], topN: number): Promise<RerankResult> {
  if (docs.length === 0) return { docs: [] };

  const scoringDocs = docs.map(d => d.length > RERANK_DOC_CAP ? d.slice(0, RERANK_DOC_CAP) : d);

  try {
    const out = await deps().rerank(query, scoringDocs, topN);
    if (out.error) throw new Error(out.error);
    const ranked = out.results
      .map(r => ({ content: docs[r.index], score: r.score }))
      .filter((d): d is RerankedDoc => typeof d.content === 'string');
    return { docs: ranked, source: out.source ?? 'cohere' };
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    const errMsg = msg.includes('abort') ? 'Rerank timeout (8s)' : `Rerank error: ${msg}`;
    console.warn('Rerank failed:', errMsg);
    return { docs: docs.slice(0, topN).map(content => ({ content, score: 0.5 })), error: errMsg };
  }
}

// Google scores run lower than Cohere for the same relevance; thresholds are per source.
const THRESHOLDS: Record<RerankSource, { high: number; medium: number }> = {
  cohere: { high: 0.45, medium: 0.25 },
  google: { high: Number(process.env.GOOGLE_RANK_HIGH) || 0.30, medium: Number(process.env.GOOGLE_RANK_MEDIUM) || 0.15 },
};

export function computeConfidence(scored: RerankedDoc[], source: RerankSource = 'cohere'): { confidence: 'high' | 'medium' | 'low'; topScore: number } {
  const topScore = scored[0]?.score ?? 0;
  const t = THRESHOLDS[source];
  if (topScore >= t.high) return { confidence: 'high', topScore };
  if (topScore >= t.medium) return { confidence: 'medium', topScore };
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

export function mmrSelect(docs: RerankedDoc[], finalN: number, lambda = 0.7): RerankedDoc[] {
  if (docs.length <= finalN) return docs;
  const pool = docs.map(d => ({ d, tok: mmrTokens(d.content) }));
  pool.sort((a, b) => b.d.score - a.d.score);
  const selected = [pool.shift()!];
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
