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

const WEIGHT_Q_RE = /\b(?:berat\w*|weight|bobot|massa)\b/i;
const WEIGHT_STOP = new Set([
  'berapa', 'brp', 'berat', 'beratnya', 'weight', 'bobot', 'massa', 'nya', 'kg', 'ton', 'unit', 'total', 'dari', 'untuk',
  'utk', 'yang', 'yg', 'itu', 'ini', 'ada', 'apa', 'the', 'of', 'saja', 'aja', 'kira', 'sekitar', 'cek', 'tolong', 'di',
  'pada', 'buat', 'assy', 'assembly', 'komponen', 'kah', 'sih', 'dong', 'ya', 'is', 'what', 'how', 'much', 'heavy',
]);
const WEIGHT_ID_EN: Record<string, string> = { pompa: 'pump', silinder: 'cylinder', kabin: 'cab', mesin: 'engine', rangka: 'frame' };

// Component named around "berat"/"weight": words after it first ("berat swing motor"), else before it ("swing motor beratnya").
export function weightComponent(text: string): string | null {
  const m = WEIGHT_Q_RE.exec(text);
  if (!m) return null;
  const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const pick = (ws: string[]) => {
    const out: string[] = [];
    for (const w of ws) {
      if (WEIGHT_STOP.has(w) || /\d/.test(w)) { if (out.length) break; continue; }
      out.push(WEIGHT_ID_EN[w] ?? w);
      if (out.length === 3) break;
    }
    return out;
  };
  let words = pick(tokens(text.slice(m.index + m[0].length)));
  if (!words.length) words = pick(tokens(text.slice(0, m.index)).reverse()).reverse();
  return words.length ? words.join(' ') : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Weight has its own finder; these are the other values technicians ask for by name.
const SPEC_ATTRS: Array<{ re: RegExp; line: string; word: string }> = [
  { re: /\brelief\b/i, line: 'relief[^\\n]{0,40}?pressure|relief valve set', word: 'relief' },
  { re: /\bcharg(?:e|ing)\b/i, line: 'charg(?:e|ing)[^\\n]{0,30}?pressure|low[- ]pressure relief', word: 'pressure' },
  { re: /\bpressure\b/i, line: 'pressure', word: 'pressure' },
  { re: /\bflow\b/i, line: 'flow rate|flow', word: 'flow' },
  { re: /\bcapacit(?:y|ies)\b/i, line: 'capacity', word: 'capacit' },
  { re: /\btorque\b/i, line: 'torque|tightening', word: 'torque' },
  { re: /\b(?:speed|rpm)\b/i, line: 'speed|rpm', word: 'speed' },
  { re: /\bvoltage\b/i, line: 'voltage', word: 'voltage' },
  { re: /\bresistance\b/i, line: 'resistance', word: 'resistance' },
  { re: /\bcurrent\b/i, line: 'current', word: 'current' },
  { re: /\btemperature\b/i, line: 'temperature', word: 'temperature' },
  { re: /\bclearance\b/i, line: 'clearance', word: 'clearance' },
  { re: /\bdisplacement\b/i, line: 'displacement', word: 'displacement' },
];
const SPEC_UNIT = '(?:MPa|kPa|bar|psi|kgf/cm|L/min|N·m|Nm|kgf·m|mm|cm3|cm³|mL|L|kg|rpm|min-1|min⁻¹|km/h|V|Ω|ohm|mA|A|°C|kW)';
const SPEC_NOT_COMPONENT = new Set([
  'pressure', 'relief', 'charge', 'charging', 'flow', 'rate', 'capacity', 'torque', 'speed', 'rpm', 'voltage', 'resistance',
  'current', 'temperature', 'clearance', 'displacement', 'value', 'values', 'standard', 'specification', 'spec', 'set',
  'setting', 'check', 'measure', 'measurement', 'normal', 'maximum', 'minimum', 'max', 'min', 'nominal', 'rated', 'mpa',
  'kpa', 'bar', 'psi', 'what', 'how', 'much', 'the', 'and', 'for', 'of', 'unit', 'machine', 'test', 'delivery', 'valve',
]);

// A spec value is one "Relief Valve Set Pressure ....44.6 MPa" line in a chunk titled for something else (ZW140 HST specs sit under "BATTERY").
export async function findSpecLines(model: string, query: string, have: string): Promise<string | null> {
  const attr = SPEC_ATTRS.find(a => a.re.test(query));
  if (!attr || !sb() || !wantsNumeric(query)) return null;
  const comp = query.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !/^\d/.test(w) && !SPEC_NOT_COMPONENT.has(w)).slice(0, 3);
  if (!comp.length) return null;
  const valueRe = new RegExp(`(?:${attr.line})[^\\n]{0,80}?\\d[\\d.,±~\\-–]*\\s*${SPEC_UNIT}(?![a-z])`, 'gi');
  try {
    let q = sb().from('documents').select('content').contains('metadata', { Model: model });
    for (const w of comp) q = q.ilike('content', `%${escapeLike(w)}%`);
    // Postgres caps regex repetition at 255, so the database only checks "attribute … number unit"; nearness is checked here.
    const { data } = await q.filter('content', 'imatch', `(${attr.line})[^\\n]{0,80}?\\d[\\d.,±~–-]*\\s*${SPEC_UNIT}`).limit(60);
    // The value must sit near the component's own name, not anywhere in a long chunk.
    const near = (c: string) => [...c.matchAll(valueRe)].some(m => {
      const before = c.slice(Math.max(0, (m.index ?? 0) - 800), m.index).toLowerCase();
      return comp.some(w => before.includes(w) || m[0].toLowerCase().includes(w));
    });
    const title = (c: string) => c.split('\n')[0];
    const cands = (data ?? []).map((d: { content?: string }) => d?.content)
      .filter((c: unknown): c is string => typeof c === 'string' && !have.includes(title(c)) && near(c));
    if (!cands.length) return null;
    const { docs, error, source } = await rerankDocs(query, capRerankPayload(cands), 2);
    if (error) return null;
    const keep = docs.filter(d => computeConfidence([d], source).confidence !== 'low');
    if (!keep.length) return null;
    console.info('[spec] %d chunk nilai "%s" (%s) ditambahkan: %s', keep.length, comp.join(' '), attr.word,
      keep.map(d => `${d.score.toFixed(2)} ${title(d.content).slice(9, 60)}`).join(' | '));
    return keep.map(d => d.content).join('\n\n---\n\n');
  } catch {
    return null;
  }
}

// A component's weight is one CAUTION line inside a long removal/disassembly chunk — vectors miss it, a literal match does not.
export async function findComponentWeight(model: string, text: string, have: string): Promise<string | null> {
  const comp = weightComponent(text);
  if (!comp || !sb()) return null;
  const words = comp.split(' ');
  const lineRe = new RegExp(`\\b${words.map(escapeRe).join('\\s+')}\\w*(?:\\s*\\([^)]{1,8}\\))?(?:\\s+assembly)?\\s+weight\\b`, 'i');
  try {
    const { data } = await sb().from('documents').select('content')
      .contains('metadata', { Model: model })
      .ilike('content', `%${words.map(escapeLike).join('%')}%weight%`)
      .limit(20);
    const title = (c: string) => c.split('\n')[0].toLowerCase();
    const hits = (data ?? [])
      .filter((d: { content?: string }) => d?.content && lineRe.test(d.content.replace(/\s+/g, ' ')) && !have.includes(d.content.split('\n')[0]))
      .sort((a: { content: string }, b: { content: string }) => Number(title(b.content).includes(comp)) - Number(title(a.content).includes(comp)))
      .slice(0, 2);
    if (!hits.length) return null;
    console.info('[berat] %d chunk berat "%s" ditambahkan', hits.length, comp);
    return hits.map((d: { content: string }) => d.content).join('\n\n---\n\n');
  } catch {
    return null;
  }
}
