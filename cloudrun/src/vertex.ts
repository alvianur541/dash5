import { InlineImage } from './types';
import { deps } from './deps';

export const MODEL        = process.env.VERTEX_MODEL || 'gemini-3.6-flash';
export const INTENT_MODEL = 'gemini-3.1-flash-lite';

interface TextPart            { text: string; thought?: boolean; thoughtSignature?: string }
export interface InlineDataPart      { inlineData: { mimeType: string; data: string } }
interface FunctionCallPart    { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
interface FunctionResponsePart { functionResponse: { name: string; response: Record<string, unknown> } }

export type Part = TextPart | InlineDataPart | FunctionCallPart | FunctionResponsePart;

export interface VContent { role: 'user' | 'model'; parts: Part[] }

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required?: string[];
  };
}

export interface VRequest {
  contents: VContent[];
  systemInstruction?: { parts: TextPart[] };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    thinkingConfig?: { thinkingLevel: ThinkingLevel };
  };
  cachedContent?: string;
  tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE' } };
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

const NO_MINIMAL_THINKING_RE = /^gemini-3\.7-/i;

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

export interface VResponse {
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
export function addUsage(input?: number, output?: number, thoughts?: number, cached?: number): void {
  const u = deps().usage;
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
  addUsage(u.promptTokenCount, u.candidatesTokenCount, u.thoughtsTokenCount, u.cachedContentTokenCount);
  return json as VResponse;
}

export function getText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => 'text' in p && !('thought' in p))
    .map(p => p.text)
    .join('');
}
