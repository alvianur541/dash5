import { getEmbedding } from './embed';
import { capRerankPayload, computeConfidence, mmrSelect, rerankWithCohere } from './rerank';
import { HybridResult, RAGResult, SearchResult, hybrid, sb } from './retrieve';
import { escapeLike, expandQuery, extractPartNumber, stripModelFromQuery } from './terms';
import type { UnitModel } from '../types';

// The DB keeps one promo period; rename this when the next period's chunks replace it.
const PROMO_KATEGORI = 'PROMO Q2 FY2026';

const ENGINE_PN_RE = /^(?:\d{10}|[A-Z]{2,3}\d{5,8}-\d{4,6}|[A-Z]{2,3}\d{10,12})$/i;

const ENGINE_CATALOG_MODELS: ReadonlySet<string> = new Set<UnitModel>(['ZX200-5G', 'ZX48U-5A', 'KCM 60ZV']);

export const MODELS_WITHOUT_PARTS_CATALOG: ReadonlySet<string> = new Set<UnitModel>(['ZX65USB-5A', 'ZX138MF-5G']);

export async function searchServiceIntervalParts(
  query: string,
  model: string,
): Promise<RAGResult> {
  if (!sb()) return { content: '', hasResults: false };

  const stripped = stripModelFromQuery(query.trim());
  let embedding: number[];
  try {
    embedding = await getEmbedding(stripped);
  } catch (err) {
    console.warn('Embed failed for interval parts search:', err);
    return { content: '', hasResults: false };
  }

  const [cpmRes, promoRes] = await Promise.allSettled([
    hybrid(stripped, embedding, 1, { Model: model, Kategori: 'CPM' }, 0.20),
    hybrid(stripped, embedding, 12, { Model: model, Kategori: PROMO_KATEGORI }, 0),
  ]);
  const rows = (r: typeof cpmRes): HybridResult[] =>
    r.status === 'fulfilled' && Array.isArray(r.value.data) ? r.value.data : [];

  const all = [...rows(cpmRes), ...rows(promoRes)];
  if (all.length === 0) return { content: '', hasResults: false };
  return {
    content: all.map(d => d.content).join('\n\n---\n\n'),
    hasResults: true,
  };
}

// Hybrid RPC only exact-matches "Part Number:" chunks; section and promo chunks need this literal lookup.
export async function exactPartRows(pn: string, model: string): Promise<HybridResult[]> {
  if (!sb()) return [];
  const kategori = new Set<string>(['PARTS CATALOG', 'ENGINE PARTS CATALOG', PROMO_KATEGORI]);
  const cell = new RegExp(`(?:^|\\|)\\s*${pn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|`, 'im');
  try {
    const { data } = await sb().from('documents').select('content, metadata')
      .contains('metadata', { Model: model })
      .ilike('content', `%${escapeLike(pn)}%`)
      .limit(12);
    return (data ?? [])
      .filter((d: { content?: string; metadata?: any }) => d?.content && d.metadata?.Model === model
        && kategori.has(d.metadata?.Kategori) && cell.test(d.content))
      .slice(0, 4)
      .map((d: { content: string; metadata?: any }) => ({ content: d.content, metadata: d.metadata, similarity: 1, match_type: 'exact_part_no' }));
  } catch {
    return [];
  }
}

const ENGINE_SECTION_TERMS: Array<[RegExp, string]> = [
  [/piston|con(?:necting)?[\s-]*rod|stang\s*seher|crank\s*shaft|kruk\s*as|metal\s*(?:jalan|duduk|bulan)|main\s*bearing|thrust\s*washer|flywheel|roda\s*gila|(?:crank(?:shaft)?|damper)\s*pulley/i, 'CRANKSHAFT'],
  [/inj(?:ection|ector)?\s*pump|pompa\s*injeksi|supply\s*pump/i, 'INJECTION PUMP'],
  [/nozzle|injector(?!\s*pump)/i, 'FUEL INJECTION'],
  [/governor/i, 'GOVERNOR'],
  [/cylinder\s*head|\bkop\b|\bklep\b|valve\s*(?:seat|guide|spring)/i, 'CYLINDER HEAD'],
  [/cylinder\s*block|blok\s*(?:mesin|silinder)|\bliner\b/i, 'CYLINDER BLOCK'],
  [/camshaft|noken\s*as|tappet|push\s*rod|rocker\s*arm/i, 'CAMSHAFT'],
  [/gasket\s*(?:kit|set)|overhaul\s*(?:kit|gasket)|paking\s*(?:set|lengkap)/i, 'GASKET'],
  [/turbo/i, 'TURBOCHARGER'],
  [/water\s*pump|pompa\s*air/i, 'WATER PUMP'],
  [/oil\s*pump|pompa\s*oli/i, 'OIL PUMP'],
  [/starter|starting\s*motor|dinamo\s*start/i, 'START'],
  [/alternator|generator|dinamo\s*(?:ampere|cas|charge)/i, 'GENERATOR'],
  [/thermostat/i, 'THERMOSTAT'],
  [/oil\s*cooler/i, 'OIL COOLER'],
];

// Vector search returns only 3 engine sections; an overhaul spans several, so pin them by section title.
export async function engineSectionRows(text: string, model: string): Promise<HybridResult[]> {
  if (!sb() || !ENGINE_CATALOG_MODELS.has(model)) return [];
  const keys = [...new Set(ENGINE_SECTION_TERMS.filter(([re]) => re.test(text)).map(([, k]) => k))].slice(0, 3);
  if (!keys.length) return [];
  const title = (d: { content: string }) => d.content.split('\n')[0].toUpperCase();
  const perKey = await Promise.all(keys.map(async key => {
    try {
      const { data } = await sb().from('documents').select('content, metadata')
        .contains('metadata', { Model: model, Kategori: 'ENGINE PARTS CATALOG' })
        .filter('content', 'imatch', `^Section:[^\\n]*${key}`)
        .limit(10);
      const rows = ((data ?? []) as HybridResult[]).filter(d => d?.content && title(d).includes(key));
      const best = Math.min(...rows.map(d => title(d).indexOf(key)));
      return rows.filter(d => title(d).indexOf(key) === best)
        .sort((a, b) => title(a).localeCompare(title(b)))
        .slice(0, 3);
    } catch {
      return [];
    }
  }));
  const seen = new Set<string>();
  const out = perKey.flat()
    .filter(d => !seen.has(d.content) && !!seen.add(d.content))
    .slice(0, 5)
    .map(d => ({ content: d.content, metadata: d.metadata, similarity: 1, match_type: 'section_title' }));
  if (out.length) console.info('[parts] section engine %s: %d section dipasang', keys.join('+'), out.length);
  return out;
}

export async function searchPartsCatalog(
  query: string,
  model: string,
  skipExpand = false,
  maxTop = 12,
  sectionHint = '',
): Promise<RAGResult> {
  if (!sb()) return { content: '', hasResults: false };

  const partNum = extractPartNumber(query);
  const isEnginePN = !!partNum && ENGINE_PN_RE.test(partNum);

  const stripped = stripModelFromQuery(query.trim());
  const embedQuery = partNum
    ? stripped
    : (skipExpand ? stripped : expandQuery(stripped));
  let embedding: number[];
  try {
    embedding = await getEmbedding(embedQuery);
  } catch (err) {
    console.warn('Embed failed for parts search:', err);
    return { content: '', hasResults: false };
  }

  const hasEngineCatalog = ENGINE_CATALOG_MODELS.has(model);

  const bodyCount = (isEnginePN && hasEngineCatalog) ? 3 : 7;
  const engineCount = isEnginePN ? 5 : 3;
  const promoCount = 5;
  const cpmCount = 1;

  const queryText = stripped;

  const PARTS_IDX = 0;
  const CPM_IDX   = 1;
  const PROMO_IDX = 2;
  const ENGINE_IDX = hasEngineCatalog ? 3 : -1;

  const queries = [
    hybrid(queryText, embedding, bodyCount, { Model: model, Kategori: 'PARTS CATALOG' }, 0.28),
    hybrid(queryText, embedding, cpmCount, { Model: model, Kategori: 'CPM' }, 0.30),
    hybrid(queryText, embedding, promoCount, { Model: model, Kategori: PROMO_KATEGORI }, 0.25),
    ...(hasEngineCatalog ? [hybrid(queryText, embedding, engineCount, { Model: model, Kategori: 'ENGINE PARTS CATALOG' }, 0.28)] : []),
  ];

  const exactPromise = partNum ? exactPartRows(partNum.toUpperCase(), model) : Promise.resolve([] as HybridResult[]);
  const sectionPromise = partNum ? Promise.resolve([] as HybridResult[]) : engineSectionRows(`${query}\n${sectionHint}`, model);
  const settled = await Promise.allSettled(queries);
  const sectionRows = await sectionPromise;
  const exact = await exactPromise;
  const getData = (idx: number): HybridResult[] =>
    idx >= 0 && settled[idx]?.status === 'fulfilled' && Array.isArray(settled[idx].value.data)
      ? settled[idx].value.data
      : [];

  const bodyData: HybridResult[]   = getData(PARTS_IDX);
  const cpmData: HybridResult[]    = getData(CPM_IDX);
  const promoData: HybridResult[]  = getData(PROMO_IDX);
  const engineData: HybridResult[] = ENGINE_IDX >= 0 ? getData(ENGINE_IDX) : [];

  if (bodyData.length === 0 && engineData.length === 0 && promoData.length === 0 && cpmData.length === 0
      && sectionRows.length === 0 && exact.length === 0) {
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

  const pinned = [...exact, ...sectionRows];
  const merged = [
    ...pinned,
    ...cpmData,
    ...orderedNonCpm.filter(d => !pinned.some(p => p.content === d.content)),
  ];
  if (exact.length) console.info('[parts] PN %s: %d section literal ditambahkan', partNum, exact.length);

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

  const top = merged.slice(0, maxTop);
  if (top.length === 0) return { content: '', hasResults: false };

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
