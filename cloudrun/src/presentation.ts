import type { EvidenceDocument } from './evidence';
import { deps } from './deps';
import type { AnswerPresentationV1, PresentationSource, SpecValueBlock, TechnicalNewsBlock, UnitModel } from './types';

const MAX_TEXT = 500;
const HTML_RE = /<\/?[a-z][^>]*>/i;
const SPEC_UNITS = 'MPa|kPa|bar|psi|kgf\\/cm(?:2|²)|L\\/min|N[·.]?m|Nm|kgf[·.]?m|lbf[·.]?ft|mm|cm(?:3|³)|mL|L|kg|rpm|min(?:-1|⁻¹)|km\\/h|V|Ω|ohm|mA|Ah|A|°C|kW';
const AMBIGUOUS_SPEC_RE = new RegExp(
  `\\b(?:high|low|range|tolerance|toleransi|minimum|maximum|max)\\b|\\bmin\\b(?!-1|⁻¹)|±|(?:-?\\d+(?:[.,]\\d+)?)\\s*(?:${SPEC_UNITS})?\\s*(?:[-–—~]|to\\b|sampai\\b|hingga\\b)\\s*-?\\d+(?:[.,]\\d+)?\\s*(?:${SPEC_UNITS})(?![A-Za-z])`,
  'i',
);

function clean(value: string | null | undefined, max = MAX_TEXT): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > max || HTML_RE.test(normalized)) return undefined;
  return normalized;
}

function field(content: string, names: string): string | undefined {
  return clean(content.match(new RegExp(`^(?:${names}):\\s*([^\\n]+)`, 'im'))?.[1]);
}

function validDocumentId(id: EvidenceDocument['document_id']): id is number | string {
  if (typeof id === 'number') return Number.isSafeInteger(id) && id > 0;
  return typeof id === 'string' && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
}

function sourceFor(doc: EvidenceDocument): PresentationSource | undefined {
  if (!validDocumentId(doc.document_id)) return undefined;
  const category = clean(doc.source, 80);
  const section = clean(doc.section, 200);
  const title = clean(doc.document, 200) ?? section;
  if (!category || !title) return undefined;
  const revision = field(doc.content, 'Revision|Revisi|Rev(?:ision)?') ?? field(doc.content, 'Date|Tanggal|Publication Date');
  return {
    documentId: String(doc.document_id),
    title,
    category,
    ...(section && section !== title ? { section } : {}),
    ...(revision ? { revision } : {}),
  };
}

function bulletinIdFor(doc: EvidenceDocument): string | undefined {
  return clean(doc.content.match(/\b(?:Technical News|Bulletin|Buletin|No\.?)\s*(?:No\.?\s*)?([A-Z0-9.-]+(?:\/[A-Z0-9.-]+)+)\b/i)?.[1], 80);
}

function technicalNews(answer: string, model: UnitModel, evidence: readonly EvidenceDocument[]): TechnicalNewsBlock | undefined {
  const eligible = evidence.filter(doc => doc.source?.trim().toUpperCase() === 'TECHNICAL NEWS'
    && doc.model === model && validDocumentId(doc.document_id));
  if (!eligible.length) return undefined;
  const bulletinIds = new Set(eligible.map(bulletinIdFor).filter((id): id is string => !!id));
  if (bulletinIds.size !== 1 || eligible.some(doc => !bulletinIdFor(doc))) return undefined;
  const doc = eligible[0];
  const sources = eligible.map(sourceFor).filter((source): source is PresentationSource => !!source)
    .filter((source, index, all) => all.findIndex(item => item.documentId === source.documentId) === index).slice(0, 3);
  const title = clean(doc.section, 200) ?? clean(doc.document, 200);
  if (!sources.length || !title) return undefined;
  const bulletinId = [...bulletinIds][0];
  const visible = bulletinId ? answer.toLowerCase().includes(bulletinId.toLowerCase()) : answer.toLowerCase().includes(title.toLowerCase());
  if (!visible) return undefined;
  const date = field(doc.content, 'Publication Date|Date|Tanggal');
  return {
    type: 'technical_news',
    ...(bulletinId ? { bulletinId } : {}),
    ...(date ? { date } : {}),
    title,
    affectedModels: [model],
    sources,
  };
}

function specification(answer: string, model: UnitModel, evidence: readonly EvidenceDocument[]): SpecValueBlock | undefined {
  const valueRe = new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*(${SPEC_UNITS})(?![A-Za-z])`, 'gi');
  const eligible = evidence.filter(doc => validDocumentId(doc.document_id)
    && doc.model === model && !!doc.source
    && /(?:MANUAL|TROUBLESHOOTING|CIRCUIT DIAGRAM|FUEL CONSUMPTION)/i.test(doc.source));
  if (AMBIGUOUS_SPEC_RE.test(answer) || eligible.some(doc => AMBIGUOUS_SPEC_RE.test(doc.content))) return undefined;
  const candidates: Array<{ value: string; unit: string; label: string; doc: EvidenceDocument; line: string; matchIndex: number; answerIndex: number }> = [];
  const observed: Array<{ value: string; unit: string; label: string }> = [];
  for (const doc of eligible) {
    for (const line of doc.content.split('\n')) {
      if (/^(?:Section|Model|Kategori|Category|Document|Catalog|Revision|Revisi|Date|Tanggal):/i.test(line.trim())) continue;
      const matches = [...line.matchAll(valueRe)];
      if (/\b(?:high|low)[- ]?(?:pressure|speed|range)?\b/i.test(line) && matches.length > 1) return undefined;
      const firstStart = matches[0]?.index ?? 0;
      const lineLabel = clean(line.slice(0, firstStart).replace(/^\s*[-*|#]+\s*/, '').replace(/[.:|\s]+$/, ''), 120);
      for (const match of matches) {
        const value = match[1];
        const unit = match[2];
        const start = match.index ?? 0;
        const context = line.slice(Math.max(0, start - 12), start + match[0].length + 16);
        if (/±|~|\b(?:to|sampai|hingga|or more|or less|minimum|maximum|max)\b|\bmin\b(?!-1|⁻¹)|\d\s*[-–]\s*\d/i.test(context)) continue;
        const label = lineLabel;
        if (!label) continue;
        observed.push({ value, unit, label });
        const answerMatch = new RegExp(`(^|\\D)${value.replace('.', '[.,]') }\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i').exec(answer);
        if (!answerMatch) continue;
        candidates.push({ value, unit, label, doc, line, matchIndex: start, answerIndex: answerMatch.index });
      }
    }
  }
  if (!candidates.length) return undefined;
  const first = candidates.reduce((best, candidate) => candidate.answerIndex < best.answerIndex ? candidate : best);
  const labelWords = new Set(first.label.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const conflicts = observed.some(item => item.unit.toLowerCase() === first.unit.toLowerCase()
    && item.value.replace(',', '.') !== first.value.replace(',', '.')
    && (item.label.toLowerCase().match(/[a-z]{4,}/g) ?? []).some(word => labelWords.has(word)));
  if (conflicts) return undefined;
  const sources = candidates.map(c => sourceFor(c.doc)).filter((s): s is PresentationSource => !!s)
    .filter((s, i, all) => all.findIndex(x => x.documentId === s.documentId) === i).slice(0, 3);
  if (!sources.length) return undefined;
  const sameLine = candidates.filter(candidate => candidate.doc === first.doc && candidate.line === first.line)
    .sort((a, b) => a.matchIndex - b.matchIndex);
  const alternateValues = sameLine.filter(candidate => candidate !== first && candidate.matchIndex > first.matchIndex
    && first.line.slice(first.matchIndex, candidate.matchIndex).lastIndexOf('(') > first.line.slice(first.matchIndex, candidate.matchIndex).lastIndexOf(')'))
    .map(candidate => ({ value: candidate.value, unit: candidate.unit }));
  const facts = candidates.filter(candidate => candidate.doc === first.doc && candidate.line !== first.line)
    .filter((candidate, index, all) => all.findIndex(item => item.line === candidate.line) === index)
    .slice(0, 4).map(candidate => ({ label: candidate.label, value: `${candidate.value} ${candidate.unit}` }));
  return { type: 'spec_value', label: first.label, value: first.value, unit: first.unit,
    ...(alternateValues.length ? { alternateValues } : {}), ...(facts.length ? { facts } : {}), unitModel: model, sources };
}

export function attachAnswerPresentation(input: {
  answer: string;
  model: UnitModel;
  evidence: readonly EvidenceDocument[];
  complete: boolean;
  groundingUnknown: number;
}): void {
  const request = deps();
  delete request.meta.presentation;
  if (!request.richAnswersEnabled || !input.complete || input.groundingUnknown !== 0) return;
  const presentation = buildAnswerPresentation(input);
  if (presentation) request.meta.presentation = presentation;
}

export function buildAnswerPresentation(input: {
  answer: string;
  model: UnitModel;
  evidence: readonly EvidenceDocument[];
}): AnswerPresentationV1 | undefined {
  const answer = clean(input.answer, 24_000);
  if (!answer) return undefined;
  const block = technicalNews(answer, input.model, input.evidence) ?? specification(answer, input.model, input.evidence);
  if (!block) return undefined;
  return { version: 1, blocks: [block, { type: 'markdown', content: input.answer }] };
}
