import { deps } from '../deps';
import { computeConfidence } from './rerank';
import { sb } from './retrieve';
import { SYMPTOM_RE } from './terms';

// Sections that start with a symptom: "E-10 - When traveling…", "MALFUNCTION OF HST WARNING INDICATOR", "Engine Ngedrop".
const SYMPTOM_SECTION_RE = '^Section: (TROUBLESHOOT|ENGINE TROUBLESHOOT|TURBOCHARGER - TROUBLESHOOT|AIR CONDITIONER - (TROUBLESHOOT|OTHER SYMPTOM)|SECTION 5 TROUBLESHOOT|MAINTENANCE - TROUBLESHOOT)';
// Correlation tables lost their tick marks in extraction; lists and contents pages match everything and answer nothing.
const SKIP_TITLE_RE = /CORRELATION TABLE|RELATIONSHIP TABLE|FAULT CODE|INTRODUCTION|CONTENTS|Daftar Gejala|PROCEDURE \(Yes/i;
const INDEX_TTL_MS = 30 * 60_000;
const MAX_RECORDS = 200;
const SNIPPET_CHARS = 1500;

interface Entry { content: string; snippet: string }

// The client is per request (user JWT) but the manual is the same for every signed-in technician, so cache per unit.
const cache = new Map<string, { at: number; entries: Promise<Entry[]> }>();
export const resetSymptomIndex = (): void => cache.clear();

const titleOf = (c: string) => (c.match(/^Section:[^\n]*/)?.[0] ?? '').replace(/\r/g, '');

function snippetOf(c: string): string {
  const body = c.split('\n').slice(1).filter(l => !/^(?:Model|Kategori|Document):/.test(l)).join('\n');
  return `${titleOf(c)}\n${body.replace(/\s+/g, ' ').slice(0, SNIPPET_CHARS)}`;
}

async function loadIndex(model: string): Promise<Entry[]> {
  const { data, error } = await sb().from('documents').select('content')
    .contains('metadata', { Model: model })
    .filter('content', 'imatch', SYMPTOM_SECTION_RE)
    .limit(400);
  if (error) throw new Error(error.message);
  const entries = (data ?? [])
    .map((d: { content?: string }) => d?.content)
    .filter((c: unknown): c is string => typeof c === 'string' && !SKIP_TITLE_RE.test(titleOf(c)))
    .map((content: string) => ({ content, snippet: snippetOf(content) }));
  console.info('[simtom] indeks %s: %d section', model, entries.length);
  return entries.slice(0, MAX_RECORDS);
}

function indexFor(model: string): Promise<Entry[]> {
  const hit = cache.get(model);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.entries;
  const entries = loadIndex(model);
  cache.set(model, { at: Date.now(), entries });
  entries.then(e => { if (!e.length) cache.delete(model); }, () => cache.delete(model));
  return entries;
}

export const isSymptomQuery = (text: string): boolean => SYMPTOM_RE.test(text);

// Vectors match a complaint to whatever chunk shares its words; the manual's own symptom titles are the better key.
export async function findSymptomSections(model: string, rankQuery: string, triggerText: string): Promise<string[]> {
  if (!sb() || !isSymptomQuery(triggerText)) return [];
  try {
    const entries = await indexFor(model);
    if (!entries.length) return [];
    const out = await deps().rerank(rankQuery, entries.map(e => e.snippet), 3);
    if (out.error) throw new Error(out.error);
    const source = out.source ?? 'cohere';
    const scored = out.results
      .filter(r => entries[r.index])
      .map(r => ({ entry: entries[r.index], score: r.score }));
    const best = scored[0]?.score ?? 0;
    const picked = scored
      .filter(s => computeConfidence([{ content: '', score: s.score }], source).confidence === 'high' && s.score >= best - 0.1)
      .slice(0, 2);
    console.info('[simtom] %s', scored.map(s =>
      `${picked.includes(s) ? '+' : '-'}${s.score.toFixed(2)} ${titleOf(s.entry.content).slice(9, 70)}`).join(' | ') || 'tanpa hasil');
    return picked.map(s => s.entry.content);
  } catch (err) {
    console.warn('[simtom] dilewati:', (err as Error)?.message);
    return [];
  }
}
