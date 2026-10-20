import { UNIT_MODELS } from '../types';
import type { AnswerPresentationV1 } from '../types';

type Obj = Record<string, unknown>;

const UNIT_SET = new Set<string>(UNIT_MODELS);
const SPEC_UNIT_RE = /^(?:MPa|kPa|bar|psi|kgf\/cm(?:2|²)|L\/min|kgf[·⋅.]?m|lbf?[·⋅.]?ft|N[·⋅.]?m|Nm|mm|cm(?:3|³)|mL|kg|lb|rpm|min(?:-1|⁻¹)|km\/h|Ah|mA|kW|°C|Ω|ohm|V|A|L)$/i;
const HTML_RE = /<\/?[a-z][^>]*>/i;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object';
const text = (v: unknown, max = 500): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !HTML_RE.test(v);
const list = (v: unknown, min: number, max: number): v is unknown[] => Array.isArray(v) && v.length >= min && v.length <= max;
const model = (v: unknown) => typeof v === 'string' && UNIT_SET.has(v);
const measure = (v: unknown) => isObj(v) && text(v.value, 80) && text(v.unit, 24) && SPEC_UNIT_RE.test(v.unit);

const source = (v: unknown) => isObj(v) && typeof v.documentId === 'string' && /^[1-9]\d*$/.test(v.documentId)
  && text(v.title, 200) && text(v.category, 80)
  && (v.section === undefined || text(v.section, 200)) && (v.revision === undefined || text(v.revision, 120));

const row = (v: unknown) => measure(v) && text((v as Obj).label, 120)
  && ((v as Obj).alternateValues === undefined || (list((v as Obj).alternateValues, 1, 4) && ((v as Obj).alternateValues as unknown[]).every(measure)));

function card(v: unknown): boolean {
  if (!isObj(v) || !list(v.sources, 1, 3) || !v.sources.every(source)) return false;
  if (v.type === 'spec_value') return row(v) && model(v.unitModel)
    && (v.facts === undefined || (list(v.facts, 1, 6) && v.facts.every(f => isObj(f) && text(f.label, 120) && text(f.value, 300))));
  if (v.type === 'spec_table') return text(v.title, 120) && model(v.unitModel) && list(v.rows, 2, 8) && v.rows.every(row);
  return v.type === 'technical_news' && text(v.title, 200) && list(v.affectedModels, 1, 6) && v.affectedModels.every(model)
    && (v.bulletinId === undefined || text(v.bulletinId, 80)) && (v.date === undefined || text(v.date, 80));
}

export function validateAnswerPresentation(value: unknown, finalText: string): AnswerPresentationV1 | undefined {
  if (!isObj(value) || value.version !== 1 || !list(value.blocks, 2, 2)) return undefined;
  const [first, second] = value.blocks;
  return card(first) && isObj(second) && second.type === 'markdown' && second.content === finalText
    ? value as unknown as AnswerPresentationV1
    : undefined;
}
