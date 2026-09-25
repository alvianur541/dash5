import { capRerankPayload, computeConfidence, rerankDocs } from './rerank';
import { RAGResult, filterByFaultCode, gatherCandidates, rankAndSelect, sb, wantsNumeric } from './retrieve';
import { escapeLike, isFaultCode, manualTerms } from './terms';
import type { UnitModel } from '../types';


const TROUBLESHOOTING_KATEGORI_BY_MODEL: Record<string, string> = {
  'ZX200-5G': 'TROUBLESHOOTING',
  'KCM 60ZV': 'WORKSHOP MANUAL',
  'ZW140': 'TROUBLESHOOTING',
};

const DEFAULT_TROUBLESHOOTING_KATEGORI = 'TECHNICAL MANUAL';

export function getTroubleshootingKategori(model: string): string {
  return TROUBLESHOOTING_KATEGORI_BY_MODEL[model] ?? DEFAULT_TROUBLESHOOTING_KATEGORI;
}

export async function searchTechnicalManualMulti(
  queries: string[],
  model: string,
  topN = 4,
  forceKategori?: string,
): Promise<RAGResult> {
  if (!sb() || queries.length === 0) return { content: '', hasResults: false };
  queries = queries.map(manualTerms);

  const primaryQuery = queries[0].trim();
  const faultCode    = isFaultCode(primaryQuery);
  const strictFilter: Record<string, string> = forceKategori
    ? { Model: model, Kategori: forceKategori }
    : faultCode
      ? { Model: model, Kategori: getTroubleshootingKategori(model) }
      : { Model: model };

  const { rankedDocs, allDocs, usedLooseFallback, embedFailed, embedError, msCari } =
    await gatherCandidates(queries, model, faultCode, strictFilter);

  // Empty because search itself failed is not "not in the manual" — surface the error instead.
  if (allDocs.length === 0) return { content: '', hasResults: false, ...(embedFailed ? { ragError: embedError } : {}) };

  const filteredDocs = faultCode ? filterByFaultCode(allDocs, primaryQuery) : allDocs;
  if (filteredDocs.length === 0) return { content: '', hasResults: false };

  return rankAndSelect(primaryQuery, filteredDocs, rankedDocs, wantsNumeric(primaryQuery), usedLooseFallback, topN, msCari);
}

const ENGINE_MANUAL_MODELS: ReadonlySet<string> = new Set<UnitModel>(['ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G']);

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

  const { docs: top, error: rerankErr, source } = await rerankDocs(pCodes[0], capRerankPayload(allDocs), topN);
  const { confidence, topScore } = computeConfidence(top, source);
  const effectiveConfidence = rerankErr && confidence === 'high' ? 'medium' : confidence;
  console.info('[confidence] em tier=%s%s topScore=%s pool=%d',
    effectiveConfidence, rerankErr ? ' (rerank GAGAL — skor semu)' : '', topScore.toFixed(2), top.length);
  return {
    content: top.map(t => t.content).join('\n\n---\n\n'),
    hasResults: top.length > 0,
    confidence: effectiveConfidence,
    topScore,
    ...(rerankErr ? { ragError: rerankErr } : {}),
  };
}

const PERF_TOPICS: Array<{ re: RegExp; term: string }> = [
  { re: /cycle\s*time|waktu\s*siklus/i, term: 'Cycle Time' },
  { re: /\bdrift\b|turun\s+sendiri|melorot/i, term: 'Drift' },
  { re: /travel\s*speed|kecepatan\s*travel|track\s*revolution|putaran\s*track/i, term: 'Travel' },
  { re: /swing\s*speed|kecepatan\s*swing|swing\s*revolution|putaran\s*swing/i, term: 'Swing' },
];

// MACHINE TEST sections only describe the procedure; the standard values live in PERFORMANCE STANDARD.
export async function findPerformanceStandard(model: string, topicText: string, have: string): Promise<string | null> {
  const topic = PERF_TOPICS.find(t => t.re.test(topicText));
  if (!topic || !sb()) return null;
  try {
    const { data } = await sb().from('documents').select('content')
      .contains('metadata', { Model: model })
      .ilike('content', 'Section: PERFORMANCE STANDARD%')
      .ilike('content', `%${escapeLike(topic.term)}%`)
      .limit(2);
    const fresh = (data ?? []).filter((d: { content?: string }) => d?.content && !have.includes(d.content.split('\n')[0]));
    if (!fresh.length) return null;
    console.info('[perf] %d tabel PERFORMANCE STANDARD (%s) ditambahkan', fresh.length, topic.term);
    return fresh.map((d: { content: string }) => d.content).join('\n\n---\n\n');
  } catch {
    return null;
  }
}
