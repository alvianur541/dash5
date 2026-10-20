import type { EvidenceDocument } from './evidence';
import { deps } from './deps';
import { normalizeTighteningText, tighteningTorqueRows } from './tightening';
import { UNIT_MODELS } from './types';
import type { AnswerPresentationV1, PresentationSource, SpecRow, SpecTableBlock, SpecValueBlock, TechnicalNewsBlock, UnitModel } from './types';

const HTML_RE = /<\/?[a-z][^>]*>/i;
const UNIT = String.raw`MPa|kPa|bar|psi|kgf/cm(?:2|²)|L/min|kgf[·⋅.]?m|lbf?[·⋅.]?ft|N[·⋅.]?m|Nm|mm|cm(?:3|³)|mL|kg|lb|rpm|min(?:-1|⁻¹)|km/h|Ah|mA|kW|°C|Ω|ohm|V|A|L`;
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const VALUE_RE = new RegExp(String.raw`(?<![\w.,+−±-])(?<![+−±]\s)(${NUM}(?:\s*[–—-]\s*${NUM})?)\s*(${UNIT})(?![A-Za-z0-9²³/])`, 'g');
const CITE_RE = /\([^()]*\b(?:Manual|Catalog|Brosur|Brochure|Technical News|Section|Document)\b[^()]*\)/gi;
const SPEC_QUESTION_RE = /\b(?:berapa|brp|brapa|berpa|spec|spek|spesifikasi|standar|standard|torsi|torque|tekanan|pressure|berat|weight|kapasitas|capacity|volume|tegangan|voltage|ampere|resistansi|resistance|tahanan|ohm|rpm|putaran|ukuran|size|celah|clearance|relief|how much)\b/i;
const NOT_SPEC_RE = /\b(?:harga|hrg|price|biaya|cara|langkah|prosedur|kenapa|mengapa|why|how to|penyebab|rusak|error|fault)\b/i;
const MAX_ROWS = 8;
const MAX_LABEL = 60;

const clean = (value: string | null | undefined, max = 500): string | undefined => {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized && normalized.length <= max && !HTML_RE.test(normalized) ? normalized : undefined;
};

const field = (content: string, names: string): string | undefined =>
  clean(content.match(new RegExp(`^(?:${names}):\\s*([^\\n]+)`, 'im'))?.[1]);

const validDocumentId = (id: EvidenceDocument['document_id']): id is number | string =>
  Number.isSafeInteger(Number(id)) && Number(id) > 0 && /^\d+$/.test(String(id));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const unitKey = (unit: string) => unit.toLowerCase().replace(/[·⋅.\s]/g, '').replace(/lbf/g, 'lb')
  .replace(/²/g, '2').replace(/³/g, '3').replace(/ω/g, 'ohm').replace(/⁻¹/g, '-1').replace(/rpm/g, 'min-1');

function sourceFor(doc: EvidenceDocument): PresentationSource | undefined {
  const category = clean(doc.source, 80);
  const section = clean(doc.section, 200);
  const title = clean(doc.document, 200) ?? section;
  if (!validDocumentId(doc.document_id) || !category || !title) return undefined;
  const revision = field(doc.content, 'Revision|Revisi|Rev') ?? field(doc.content, 'Publication Date|Date|Tanggal');
  return {
    documentId: String(doc.document_id), title, category,
    ...(section && section !== title ? { section } : {}),
    ...(revision ? { revision } : {}),
  };
}

const uniqueSources = (docs: readonly EvidenceDocument[]): PresentationSource[] =>
  docs.map(sourceFor).filter((s): s is PresentationSource => !!s)
    .filter((s, i, all) => all.findIndex(x => x.documentId === s.documentId) === i).slice(0, 3);

const isSpecQuestion = (question: string): boolean => SPEC_QUESTION_RE.test(question) && !NOT_SPEC_RE.test(question);

function titleFrom(question: string): string | undefined {
  const models = UNIT_MODELS.map(escape).join('|');
  const text = question.split(/[?\n]/)[0]
    .replace(new RegExp(`\\b(?:${models})\\b`, 'gi'), ' ')
    .replace(/\b(?:berapa|brp|brapa|berpa|nilai|exact|ya|sih|kah)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return text.length >= 3 && text.length <= 70 ? text[0].toUpperCase() + text.slice(1) : undefined;
}

function labelFrom(text: string): string {
  return text.replace(/^[\s>#•\-–—]+|^\d+[.)]\s+/g, '').replace(/^(?:dan|and|serta)\s+/i, '')
    .replace(/\s*(?:[:=(]|\badalah|\bsebesar|\bialah|\byaitu|\bis)\s*$/i, '').trim();
}

const insideParens = (segment: string) => segment.lastIndexOf('(') > segment.lastIndexOf(')');

function claimsFrom(answer: string): SpecRow[] {
  const rows: SpecRow[] = [];
  for (const raw of answer.split('\n')) {
    const line = raw.replace(/[`*_]/g, '').replace(CITE_RE, '');
    let primary: SpecRow | undefined;
    let primaryEnd = 0;
    let lastEnd = 0;
    for (const m of line.matchAll(VALUE_RE)) {
      const start = m.index ?? 0;
      const value = m[1].replace(/\s*[–—-]\s*/, '–');
      if (primary && insideParens(line.slice(primaryEnd, start)) && unitKey(m[2]) !== unitKey(primary.unit)) {
        (primary.alternateValues ??= []).push({ value, unit: m[2] });
      } else {
        primary = { label: labelFrom(line.slice(lastEnd, start)), value, unit: m[2] };
        rows.push(primary);
        primaryEnd = start + m[0].length;
      }
      lastEnd = start + m[0].length;
    }
  }
  return rows.filter((r, i) => rows.findIndex(x => x.label === r.label && x.value === r.value && x.unit === r.unit) === i);
}

function located(content: string, value: string, unit: string): boolean {
  const text = content.replace(/[–—~]/g, '-');
  const [a, b] = value.split('–').map(n => escape(n.replace(',', '.')));
  const number = b ? `${a}\\s*(?:-|to)\\s*${b}` : `(?<!\\d\\s*-\\s*)${a}(?!\\s*-\\s*\\d)`;
  const near = unit.length <= 1 ? 4 : 40;
  for (const m of text.matchAll(new RegExp(`(?<![\\d.])${number}(?!\\d|\\.\\d)`, 'gi'))) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const before = unit.length <= 1 ? '' : text.slice(Math.max(0, start - 300), start);
    if (unitKey(before + text.slice(end, end + near)).includes(unitKey(unit))) return true;
  }
  return false;
}

function specCard(question: string, answer: string, model: UnitModel, evidence: readonly EvidenceDocument[]): SpecValueBlock | SpecTableBlock | undefined {
  const docs = evidence.filter(d => d.model === model && validDocumentId(d.document_id) && !!d.source
    && !/PARTS|PROMO|WEB|EKSTERNAL|EXTERNAL/i.test(d.source));
  const claims = claimsFrom(answer);
  if (!docs.length || !claims.length || claims.length > MAX_ROWS) return undefined;
  const used = new Set<EvidenceDocument>();
  for (const claim of claims) {
    const doc = docs.find(d => located(d.content, claim.value, claim.unit));
    if (!doc) return undefined;
    used.add(doc);
    const alternates = claim.alternateValues?.filter(alt => located(doc.content, alt.value, alt.unit));
    if (alternates?.length) claim.alternateValues = alternates;
    else delete claim.alternateValues;
  }
  const sources = uniqueSources([...used]);
  const title = titleFrom(question);
  const rows = claims.filter(c => c.label.length >= 2 && c.label.length <= MAX_LABEL);
  const hidden = claims.filter(c => !rows.includes(c));
  if (!sources.length || (rows.length && hidden.some(h => !rows.some(r => r.value === h.value && r.unit === h.unit)))) return undefined;
  if (claims.length === 1 || rows.length === 1) {
    const [{ label, ...value }] = rows.length ? rows : claims;
    const name = (label.length <= 48 && label) || title;
    return name ? { type: 'spec_value', label: name, ...value, unitModel: model, sources } : undefined;
  }
  return title && rows.length ? { type: 'spec_table', title, rows, unitModel: model, sources } : undefined;
}

function tighteningSpecification(answer: string, model: UnitModel, evidence: readonly EvidenceDocument[]): SpecValueBlock | undefined {
  const normalizedAnswer = normalizeTighteningText(answer);
  const matches = evidence.flatMap(doc => validDocumentId(doc.document_id) && doc.model === model && /MANUAL|TROUBLESHOOTING/i.test(doc.source ?? '')
    ? tighteningTorqueRows(doc.content).filter(row => normalizedAnswer.includes(normalizeTighteningText(row.location))).map(row => ({ doc, row }))
    : []);
  if (matches.length !== 1) return undefined;
  const { doc, row } = matches[0];
  const visible = (value: string, unit: string) => new RegExp(`(^|\\D)${value.replace('.', '[.,]')}\\s*${unit}`, 'i').test(answer);
  const source = sourceFor(doc);
  if (!source || !visible(row.torque, 'N[·⋅.]?m') || !visible(row.kgfM, 'kgf[·⋅.]?m') || !visible(row.lbfFt, 'lbf[·⋅.]?ft')) return undefined;
  return {
    type: 'spec_value', label: row.location, value: row.torque, unit: 'N⋅m',
    alternateValues: [{ value: row.kgfM, unit: 'kgf⋅m' }, { value: row.lbfFt, unit: 'lbf⋅ft' }],
    facts: [
      { label: 'Bolt Diameter', value: `${row.boltDiameter} mm` },
      { label: 'Wrench Size', value: `${row.wrenchSize} mm` },
      { label: 'Quantity', value: row.quantity },
    ],
    unitModel: model,
    sources: [source],
  };
}

const bulletinIdFor = (doc: EvidenceDocument): string | undefined =>
  clean(doc.content.match(/\b(?:Technical News|Bulletin|Buletin|No\.?)\s*(?:No\.?\s*)?([A-Z0-9.-]+(?:\/[A-Z0-9.-]+)+)\b/i)?.[1], 80);

function technicalNews(answer: string, model: UnitModel, evidence: readonly EvidenceDocument[]): TechnicalNewsBlock | undefined {
  const text = answer.toLowerCase();
  const mentioned = evidence.filter(doc => {
    if (doc.source?.trim().toUpperCase() !== 'TECHNICAL NEWS' || doc.model !== model || !validDocumentId(doc.document_id)) return false;
    const id = bulletinIdFor(doc);
    const title = clean(doc.section, 200) ?? clean(doc.document, 200);
    return (!!id && text.includes(id.toLowerCase())) || (!!title && text.includes(title.toLowerCase()));
  });
  const ids = new Set(mentioned.map(bulletinIdFor));
  if (!mentioned.length || ids.size !== 1 || ids.has(undefined)) return undefined;
  const [bulletinId] = ids as Set<string>;
  const doc = mentioned[0];
  const title = clean(doc.section, 200) ?? clean(doc.document, 200);
  const sources = uniqueSources(mentioned);
  if (!title || !sources.length || !text.includes(bulletinId.toLowerCase())) return undefined;
  const date = field(doc.content, 'Publication Date|Date|Tanggal');
  return { type: 'technical_news', bulletinId, ...(date ? { date } : {}), title, affectedModels: [model], sources };
}

export function buildAnswerPresentation(input: {
  question: string;
  answer: string;
  model: UnitModel;
  evidence: readonly EvidenceDocument[];
}): AnswerPresentationV1 | undefined {
  const answer = clean(input.answer, 24_000) && input.answer;
  if (!answer) return undefined;
  const spec = isSpecQuestion(input.question);
  const block = technicalNews(answer, input.model, input.evidence)
    ?? (spec ? tighteningSpecification(answer, input.model, input.evidence) ?? specCard(input.question, answer, input.model, input.evidence) : undefined);
  return block ? { version: 1, blocks: [block, { type: 'markdown', content: answer }] } : undefined;
}

export function attachAnswerPresentation(input: Parameters<typeof buildAnswerPresentation>[0] & { complete: boolean }): void {
  const request = deps();
  delete request.meta.presentation;
  if (!request.richAnswersEnabled || !input.complete) return;
  const presentation = buildAnswerPresentation(input);
  if (presentation) request.meta.presentation = presentation;
}
