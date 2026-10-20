import { UNIT_MODELS } from '../types';
import type {
  AnswerPresentationV1, AnswerPresentationBlockV1, MarkdownBlock, PresentationSource,
  SpecValueBlock, TechnicalNewsBlock, UnitModel,
} from '../types';

const UNIT_SET = new Set<string>(UNIT_MODELS);
const SPEC_UNITS = /^(?:MPa|kPa|bar|psi|kgf\/cm(?:2|²)|L\/min|N[·⋅.]?m|Nm|kgf[·⋅.]?m|lbf[·⋅.]?ft|mm|cm(?:3|³)|mL|L|kg|rpm|min(?:-1|⁻¹)|km\/h|V|Ω|ohm|mA|Ah|A|°C|kW)$/i;
const HTML_RE = /<\/?[a-z][^>]*>/i;

function text(value: unknown, max = 500): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !HTML_RE.test(value);
}

function model(value: unknown): value is UnitModel {
  return typeof value === 'string' && UNIT_SET.has(value);
}

function source(value: unknown): value is PresentationSource {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.documentId === 'string' && /^[1-9]\d*$/.test(item.documentId)
    && text(item.title, 200) && text(item.category, 80)
    && (item.section === undefined || text(item.section, 200))
    && (item.revision === undefined || text(item.revision, 120));
}

function sources(value: unknown): value is PresentationSource[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 3 && value.every(source);
}

function spec(value: unknown): value is SpecValueBlock {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (item.type !== 'spec_value' || !text(item.label, 120) || !text(item.value, 80)
    || !text(item.unit, 24) || !SPEC_UNITS.test(item.unit) || !model(item.unitModel) || !sources(item.sources)) return false;
  if (item.alternateValues !== undefined && (!Array.isArray(item.alternateValues) || item.alternateValues.length > 4
    || !item.alternateValues.every(alt => alt && typeof alt === 'object'
      && text((alt as Record<string, unknown>).value, 80)
      && text((alt as Record<string, unknown>).unit, 24)
      && SPEC_UNITS.test((alt as Record<string, unknown>).unit as string)))) return false;
  return item.facts === undefined || (Array.isArray(item.facts) && item.facts.length <= 6
    && item.facts.every(fact => fact && typeof fact === 'object'
      && text((fact as Record<string, unknown>).label, 120) && text((fact as Record<string, unknown>).value, 300)));
}

function news(value: unknown): value is TechnicalNewsBlock {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.type === 'technical_news' && text(item.title, 200)
    && (item.bulletinId === undefined || text(item.bulletinId, 80))
    && (item.date === undefined || text(item.date, 80))
    && Array.isArray(item.affectedModels) && item.affectedModels.length > 0 && item.affectedModels.every(model)
    && sources(item.sources);
}

function markdown(value: unknown, finalText: string): value is MarkdownBlock {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.type === 'markdown' && item.content === finalText;
}

export function validateAnswerPresentation(value: unknown, finalText: string): AnswerPresentationV1 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  if (payload.version !== 1 || !Array.isArray(payload.blocks) || payload.blocks.length !== 2) return undefined;
  const cards = payload.blocks.filter(block => spec(block) || news(block)) as AnswerPresentationBlockV1[];
  const markdownBlocks = payload.blocks.filter(block => markdown(block, finalText));
  if (cards.length !== 1 || markdownBlocks.length !== 1) return undefined;
  return value as AnswerPresentationV1;
}
