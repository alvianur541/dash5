import { deps } from '../deps';
import { callProxy, getText, INTENT_MODEL } from '../vertex';
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
const PER_QUERY = 5;
const MAX_PICK = 2;

interface Entry { content: string; snippet: string; summary: string }

// The client is per request (user JWT) but the manual is the same for every signed-in technician, so cache per unit.
const cache = new Map<string, { at: number; entries: Promise<Entry[]> }>();
export const resetSymptomIndex = (): void => cache.clear();

const titleOf = (c: string) => (c.match(/^Section:[^\n]*/)?.[0] ?? '').replace(/\r/g, '');

function bodyOf(c: string): string {
  return c.split('\n').slice(1).filter(l => !/^(?:Model|Kategori|Document):/.test(l)).join('\n')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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
    .map((content: string) => {
      const body = bodyOf(content);
      return { content, snippet: `${titleOf(content)}\n${body.slice(0, SNIPPET_CHARS)}`, summary: `${titleOf(content).slice(9)} — ${body.slice(0, 220)}` };
    });
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

const VERIFY_SYS = `You match a heavy-equipment technician's complaint to troubleshooting sections of one service manual.
Output ONLY a JSON array of candidate numbers, best match first, at most ${MAX_PICK}. No prose.
Pick a candidate only when its symptom is the same as the complaint, or a broader symptom that clearly includes it
(e.g. "all movements weak / engine drops under load" includes "engine rpm drops when the travel lever is moved").
A different system, a fault-code list, a component layout, or a test procedure for something else does NOT count.
Wording can be Indonesian or English; judge the meaning. If nothing fits, output [].`;

// The ranker's absolute score drifts with language and phrasing; a small model judging its top candidates does not.
async function verify(complaint: string, cands: Entry[]): Promise<Entry[]> {
  const list = cands.map((c, i) => `[${i + 1}] ${c.summary}`).join('\n');
  const res = await callProxy({
    contents: [{ role: 'user', parts: [{ text: `Complaint: "${complaint}"\n\nCandidates:\n${list}` }] }],
    systemInstruction: { parts: [{ text: VERIFY_SYS }] },
    generationConfig: { maxOutputTokens: 40, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
  }, false, INTENT_MODEL);
  const raw = getText(res.candidates?.[0]?.content?.parts ?? []);
  const arr = raw.match(/\[[\d,\s]*\]/)?.[0];
  if (!arr) throw new Error(`jawaban verifikasi bukan daftar angka: ${raw.slice(0, 60)}`);
  return [...new Set(JSON.parse(arr) as number[])].map(n => cands[n - 1]).filter(Boolean).slice(0, MAX_PICK);
}

// Vectors match a complaint to whatever chunk shares its words; the manual's own symptom titles are the better key.
export async function findSymptomSections(model: string, rankQueries: string[], complaint: string, triggerText: string): Promise<string[]> {
  if (!sb() || !isSymptomQuery(triggerText)) return [];
  try {
    const entries = await indexFor(model);
    if (!entries.length) return [];
    const queries = [...new Set(rankQueries.map(q => q.trim()).filter(Boolean))];
    const runs = await Promise.all(queries.map(q => deps().rerank(q, entries.map(e => e.snippet), PER_QUERY)));
    const failed = runs.find(r => r.error);
    if (failed) throw new Error(failed.error);
    const source = runs[0]?.source ?? 'cohere';
    const best = new Map<number, number>();
    for (const r of runs) for (const { index, score } of r.results) {
      if (entries[index]) best.set(index, Math.max(best.get(index) ?? 0, score));
    }
    const ranked = [...best].sort((a, b) => b[1] - a[1]).map(([i, score]) => ({ entry: entries[i], score }));
    if (!ranked.length) return [];
    const label = (e: Entry) => titleOf(e.content).slice(9, 70);

    let picked: Entry[];
    try {
      picked = await verify(complaint, ranked.map(r => r.entry));
    } catch (err) {
      // Without the judge, only a confident ranker score is safe to inject.
      console.warn('[simtom] verifikasi gagal (%s) — pakai ambang skor', (err as Error)?.message);
      picked = ranked.filter(r => computeConfidence([{ content: '', score: r.score }], source).confidence === 'high').slice(0, MAX_PICK).map(r => r.entry);
    }
    console.info('[simtom] kandidat: %s || dipilih: %s',
      ranked.map(r => `${r.score.toFixed(2)} ${label(r.entry)}`).join(' | '),
      picked.map(label).join(' | ') || '(tidak ada)');
    return picked.map(e => e.content);
  } catch (err) {
    console.warn('[simtom] dilewati:', (err as Error)?.message);
    return [];
  }
}
