import type { Message } from './types';
import { deps } from './deps';

export interface ResolvedQuestion {
  readonly raw: string;
  readonly text: string;
  readonly model: string;
  readonly component: string | null;
  readonly attribute: string | null;
  readonly sourceHint: string | null;
  readonly userContext: readonly string[];
  readonly measurements: readonly string[];
  readonly conditions: readonly string[];
  readonly aspects: readonly string[];
  readonly acceptedOffer: string | null;
}
const COMPONENT_RE = /travel device|swing motor|main pump|engine|mesin|cylinder|silinder|solenoid|harness|compressor|kompresor|fuse(?:\s*(?:no\.?|nomor)?\s*\d+)?|terminal\s*[ab]|transmisi|transmission|bucket|undercarriage/i;
const ATTRIBUTE_RE = /berat|weight|pressure|tekanan|resistance|resistansi|kapasitas|capacity|length|panjang|diameter|torque|torsi|harga|price|part number|\bpn\b/i;
export function resolveQuestion(raw: string, history: Message[], model: string, acceptedOffer: string | null = null): ResolvedQuestion {
  const explicit = COMPONENT_RE.exec(raw)?.[0] ?? null;
  const prior = history.filter(m => m.role === 'user' && m.content?.trim()).slice(-3).map(m => m.content);
  const refers = /\b(?:itu|ini|nya|tadi|tersebut|fokus|diputus|dilepas|masih|standarnya|yang|lanjut)\b/i.test(raw);
  const short = raw.trim().split(/\s+/).length <= 8 && !explicit && !ATTRIBUTE_RE.test(raw);
  const priorComponent = COMPONENT_RE.exec(prior.at(-1) ?? '')?.[0] ?? null;
  const sameCircuit = /^(?:fuse|terminal)/i.test(explicit ?? '') && /^(?:fuse|terminal)/i.test(priorComponent ?? '');
  const newComponent = !!explicit && !!priorComponent && explicit.toLowerCase() !== priorComponent.toLowerCase() && !sameCircuit;
  const userContext = !newComponent && (refers || short || acceptedOffer) ? prior : [];
  const text = [...userContext, acceptedOffer ? `Permintaan diterima: ${acceptedOffer}` : '', raw].filter(Boolean).join('\nLanjutan teknisi: ');
  const measurements = [...text.matchAll(/\d+(?:[.,]\d+)?\s*(?:MPa|kPa|bar|psi|V|mA|A|Ω|ohm|mm|L|rpm|kg|°C)\b|\d+(?:[.,]\d+)?\s*Ω/g)].map(m => m[0]);
  return Object.freeze({ raw, text, model, component: explicit ?? COMPONENT_RE.exec(userContext.join(' '))?.[0] ?? null,
    attribute: ATTRIBUTE_RE.exec(raw)?.[0] ?? null, sourceHint: /(?:workshop|operator|engine|sales|technical)\s*(?:manual|news)|circuit diagram|brosur/i.exec(text)?.[0] ?? null,
    userContext: Object.freeze(userContext), measurements: Object.freeze(measurements), conditions: Object.freeze([raw]),
    aspects: Object.freeze(raw.split(/\s+(?:dan|sekalian|beserta)\s+|[;&]/i).filter(Boolean)), acceptedOffer });
}
export function questionFor(raw: string, history: Message[], model: string): ResolvedQuestion {
  try { const r = deps().resolvedQuestion; if (r) return r; } catch { /* no request */ }
  return resolveQuestion(raw, history, model);
}
