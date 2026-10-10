import { deps, type RerankSource } from './deps';

export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
export type EvidenceRole = 'retrieved' | 'literal_pn' | 'serial_bulletin' | 'oh_package' | 'procedure' | 'numeric' | 'symptom';
export interface EvidenceDocument {
  document_id: number | string | null;
  source: string | null;
  section: string | null;
  document: string | null;
  model: string | null;
  content: string;
  evidence_role: EvidenceRole;
  score?: number;
  score_source?: RerankSource;
  aspects?: readonly string[];
}
const records = new WeakMap<object, Map<string, EvidenceDocument>>();
export function evidenceDocument(row: { id?: number | string; content: string; metadata?: any }, role: EvidenceRole = 'retrieved'): EvidenceDocument {
  const field = (name: string) => row.content.match(new RegExp(`^(?:${name}):\\s*([^\\n]+)`, 'm'))?.[1]?.trim() ?? null;
  return { document_id: row.id ?? null, source: row.metadata?.Kategori ?? field('Kategori|Category|Document Type'),
    section: field('Section|Topic'), document: field('Document|Catalog'), model: row.metadata?.Model ?? field('Model'),
    content: row.content, evidence_role: role === 'retrieved' && /^Section:[^\n]*(?:procedure|troubleshoot|inspection method)/im.test(row.content) ? 'procedure' : role };
}
export function registerEvidence(rows: Array<{ id?: number | string; content?: string; metadata?: any }>): void {
  try {
    const owner = deps();
    let map = records.get(owner);
    if (!map) { map = new Map(); records.set(owner, map); }
    for (const r of rows) if (typeof r.content === 'string') {
      const known = map.get(r.content);
      if (r.id !== undefined || known?.document_id == null) map.set(r.content, evidenceDocument({ ...r, content: r.content }));
    }
  } catch { /* no request */ }
}
export function evidenceFor(content: string, role: EvidenceRole = 'retrieved'): EvidenceDocument {
  let known: EvidenceDocument | undefined;
  try { known = records.get(deps())?.get(content); } catch { /* no request */ }
  const doc = known ?? evidenceDocument({ content });
  return { ...doc, evidence_role: role === 'retrieved' ? doc.evidence_role : role };
}
export function evidenceBlocks(content: string, role: EvidenceRole = 'retrieved'): EvidenceDocument[] {
  if (!content) return [];
  let matches: EvidenceDocument[] = [];
  try { matches = [...(records.get(deps())?.values() ?? [])].filter(d => content.includes(d.content)); } catch { /* no request */ }
  const remainder = matches.reduce((text, d) => text.replace(d.content, ''), content).replace(/\n\n---\n\n/g, '').trim();
  if (remainder) return [evidenceFor(content, role)];
  return matches.length ? matches.map(d => ({ ...d, evidence_role: role === 'retrieved' ? d.evidence_role : role })) : [evidenceFor(content, role)];
}
export const assembleEvidence = (docs: readonly EvidenceDocument[]): string => docs.map(d => d.content).join('\n\n---\n\n');
export function weakestConfidence(values: Array<Confidence | undefined>): Confidence {
  if (!values.length || values.some(v => !v || v === 'unknown')) return 'unknown';
  if (values.includes('low')) return 'low';
  return values.includes('medium') ? 'medium' : 'high';
}
