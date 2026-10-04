import { InlineImage } from './types';
import { deps } from './deps';

export const MODEL        = process.env.VERTEX_MODEL || 'gemini-3.6-flash';
export const INTENT_MODEL = process.env.INTENT_MODEL || 'gemini-3.5-flash-lite';
export const FALLBACK_MODELS: readonly string[] = (process.env.FALLBACK_MODELS ?? 'gemini-3.6-flash')
  .split(',').map(s => s.trim()).filter(s => s && s !== MODEL);
export const MODEL_CHAIN: readonly string[] = [MODEL, ...FALLBACK_MODELS];

interface TextPart              { text: string; thought?: boolean }
export interface InlineDataPart { inlineData: { mimeType: string; data: string } }

export type Part = TextPart | InlineDataPart;

export interface VContent { role: 'user' | 'model'; parts: Part[] }

export interface VRequest {
  contents: VContent[];
  systemInstruction?: { parts: TextPart[] };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  };
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

const NO_MINIMAL_THINKING_RE = /^gemini-(?:3\.(?:[7-9]|\d{2,})|(?:[4-9]|\d{2,})\.\d+)-/i;

export function clampThinking(body: VRequest, model: string): VRequest {
  const asli = body.generationConfig?.thinkingConfig?.thinkingLevel;
  if (!asli) return body;

  const override = deps().thinkOverride;
  let lvl: ThinkingLevel = override && model !== INTENT_MODEL ? override : asli;
  if (lvl === 'minimal' && NO_MINIMAL_THINKING_RE.test(model)) lvl = 'low';

  if (lvl === asli) return body;
  return {
    ...body,
    generationConfig: {
      ...body.generationConfig,
      thinkingConfig: { thinkingLevel: lvl },
    },
  };
}

interface VResponse {
  candidates?: Array<{
    content?: { role: string; parts: Part[] };
    finishReason?: string;
  }>;
}

export function toInlineData(img: InlineImage): InlineDataPart {
  return { inlineData: { mimeType: img.mimeType, data: img.data } };
}

export function resetUsage(): void {
  const u = deps().usage;
  u.input = 0; u.output = 0; u.calls = 0; u.thinking = 0; u.cached = 0;
}
// USD per 1M tokens at Google list price (= "Usage cost" in Cloud Billing, before credits/promo).
// Output includes thinking. Cached input bills at 10% of input. Update when Google changes prices.
export const HARGA_MODEL: Record<string, { in: number; out: number }> = {
  'gemini-3.8-flash': { in: 1.50, out: 7.50 },
  'gemini-3.7-flash': { in: 1.50, out: 7.50 },
  'gemini-3.6-flash': { in: 1.50, out: 7.50 },
  'gemini-3.5-flash': { in: 1.50, out: 9.00 },
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
};
const HARGA_DEFAULT = { in: 1.50, out: 7.50 };

export function biayaPanggilan(model: string | undefined, input = 0, outputPlusThinking = 0, cached = 0): number {
  const h = (model && HARGA_MODEL[model]) || HARGA_DEFAULT;
  const c = Math.min(cached, input);
  return ((input - c) * h.in + c * h.in * 0.1 + outputPlusThinking * h.out) / 1e6;
}

export function addUsage(input?: number, output?: number, thoughts?: number, cached?: number, model?: string): void {
  const u = deps().usage;
  u.cost = (u.cost || 0) + biayaPanggilan(model, input || 0, (output || 0) + (thoughts || 0), cached || 0);
  u.input    += input || 0;
  u.output   += (output || 0) + (thoughts || 0);
  u.thinking += thoughts || 0;
  u.cached   += cached || 0;
  u.calls    += 1;
}

export async function callProxy(body: VRequest, enableGoogleSearch = false, modelOverride?: string): Promise<VResponse> {
  const modelUsed = modelOverride ?? MODEL;
  const json = await deps().generate(clampThinking(body, modelUsed), modelUsed, enableGoogleSearch);
  const u = json?.usageMetadata ?? {};
  addUsage(u.promptTokenCount, u.candidatesTokenCount, u.thoughtsTokenCount, u.cachedContentTokenCount, modelUsed);
  return json as VResponse;
}

export function getText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => 'text' in p && !('thought' in p))
    .map(p => p.text)
    .join('');
}
