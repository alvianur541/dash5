/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SYSTEM_PROMPT } from '../constants';
import { UnitModel, Message } from '../types';
import { searchTechnicalManual } from './supabase';

// ── Config ────────────────────────────────────────────────────────────────────
const PROXY_URL  = import.meta.env.VITE_VERTEX_PROXY_URL as string;   // Cloud Run URL
const MODEL      = import.meta.env.VITE_VERTEX_MODEL || 'gemini-2.0-flash-001';

// ── Vertex AI types ───────────────────────────────────────────────────────────
interface TextPart         { text: string }
interface InlineDataPart   { inlineData: { mimeType: string; data: string } }
interface FunctionCallPart { functionCall: { name: string; args: Record<string, unknown> } }
interface FunctionRespPart { functionResponse: { name: string; response: { content: string } } }

type Part = TextPart | InlineDataPart | FunctionCallPart | FunctionRespPart;

interface VContent { role: 'user' | 'model'; parts: Part[] }

interface VRequest {
  contents: VContent[];
  systemInstruction?: { parts: TextPart[] };
  tools?: Array<{ functionDeclarations: FunctionDecl[] }>;
  generationConfig?: { maxOutputTokens?: number; temperature?: number };
}

interface FunctionDecl {
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required?: string[] };
}

interface VResponse {
  candidates: Array<{
    content: { role: string; parts: Part[] };
    finishReason: string;
  }>;
}

// ── Tool declaration ──────────────────────────────────────────────────────────
const searchDecl: FunctionDecl = {
  name: 'searchTechnicalManual',
  description:
    'Search the heavy equipment technical manual for components, fault codes, or procedures. ' +
    'DO NOT include the unit model name in the query — it is filtered automatically by the system.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Core technical keywords, symptom description, system name, or fault code. Exclude the machine model name.',
      },
    },
    required: ['query'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToInlineData(file: File): Promise<InlineDataPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({ inlineData: { mimeType: file.type, data: base64 } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callProxy(body: VRequest, enableGoogleSearch = false): Promise<VResponse> {
  const res = await fetch(`${PROXY_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, enableGoogleSearch, ...body }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vertex AI error ${res.status}: ${err}`);
  }
  return res.json() as Promise<VResponse>;
}

function getText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => 'text' in p)
    .map(p => p.text)
    .join('');
}

function getFunctionCalls(parts: Part[]): FunctionCallPart[] {
  return parts.filter((p): p is FunctionCallPart => 'functionCall' in p);
}

// Convert history messages (Anthropic-style from our app) → Vertex AI contents
function historyToContents(history: Message[]): VContent[] {
  return history
    .filter(m => m.content?.trim())
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }] as Part[],
    }));
}

// ── OCR via Vertex AI (extract fault codes from images) ───────────────────────
async function extractFaultCodes(imageParts: InlineDataPart[]): Promise<string[]> {
  const res = await callProxy({
    contents: [{
      role: 'user',
      parts: [
        ...imageParts,
        { text: 'Extract all fault codes visible in this image. Return ONLY the codes separated by commas (e.g., "CA2769, E03"). If none found, return NONE.' },
      ],
    }],
    systemInstruction: {
      parts: [{ text: 'You are an OCR specialist for heavy equipment diagnostic systems. Return only fault codes, nothing else.' }],
    },
    generationConfig: { maxOutputTokens: 300 },
  });

  const raw = getText(res.candidates[0]?.content?.parts ?? []).trim();
  if (!raw || raw === 'NONE') return [];
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateResponse(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  attachments?: File[]
): Promise<string> {
  if (!PROXY_URL) {
    throw new Error('VITE_VERTEX_PROXY_URL tidak dikonfigurasi. Tambahkan ke .env.local');
  }

  const systemInstruction = SYSTEM_PROMPT(model, userName);
  const contents: VContent[] = historyToContents(history);

  // ── Build current user turn ────────────────────────────────────────────────
  const currentParts: Part[] = [];

  if (attachments && attachments.length > 0) {
    const imageParts = await Promise.all(attachments.map(fileToInlineData));
    currentParts.push(...imageParts);

    try {
      const faultCodes = await extractFaultCodes(imageParts);

      if (faultCodes.length > 0) {
        const searchEntries = await Promise.all(
          faultCodes.map(async code => {
            try {
              const result = await searchTechnicalManual(code, model);
              return result.hasResults ? `[Fault Code: ${code}]\n${result.content}` : null;
            } catch { return null; }
          })
        );
        const searchResults = searchEntries.filter(Boolean) as string[];

        const note =
          `Fault code terdeteksi dari gambar: **${faultCodes.join(', ')}**\n\n` +
          (userInput || 'Analisa fault code ini dan berikan diagnosis lengkap.');

        currentParts.push({
          text: searchResults.length
            ? `${note}\n\n[DATA MANUAL TERSEDIA]\n${searchResults.join('\n\n===\n\n')}`
            : note,
        });
      } else {
        currentParts.push({ text: userInput || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.' });
      }
    } catch {
      currentParts.push({ text: userInput || 'Analisa gambar ini, identifikasi fault code, dan berikan diagnosis.' });
    }
  } else {
    const text = userInput.trim();
    currentParts.push({ text: text || 'Halo' });
  }

  contents.push({ role: 'user', parts: currentParts });

  // ── First call (may trigger function call) ─────────────────────────────────
  const firstRes = await callProxy({
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: [searchDecl] }],
    generationConfig: { maxOutputTokens: 4096 },
  });

  const firstCandidate = firstRes.candidates[0];
  if (!firstCandidate) throw new Error('Vertex AI tidak mengembalikan respons.');

  // ── Handle function call (tool use) ───────────────────────────────────────
  // Vertex AI Gemini signals function calls via parts content, not finishReason
  const fnCalls = getFunctionCalls(firstCandidate.content?.parts ?? []);
  if (fnCalls.length > 0) {
    // Append model's function call turn
    contents.push({ role: 'model', parts: firstCandidate.content.parts });

    // Execute each function and collect results
    const responseParts: FunctionRespPart[] = [];
    let ragFound = false;
    for (const fc of fnCalls) {
      if (fc.functionCall.name === 'searchTechnicalManual') {
        const query = fc.functionCall.args['query'] as string;
        const result = await searchTechnicalManual(query, model);
        if (result.hasResults) ragFound = true;
        responseParts.push({
          functionResponse: {
            name: 'searchTechnicalManual',
            response: {
              content: result.hasResults
                ? result.content
                : 'No relevant data found in the technical manual database.',
            },
          },
        });
      }
    }

    // Append tool results turn
    contents.push({ role: 'user', parts: responseParts });

    // Final call — aktifkan Google Search hanya jika RAG tidak menemukan data
    const finalRes = await callProxy({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { maxOutputTokens: 4096 },
    }, !ragFound);

    const finalText = getText(finalRes.candidates[0]?.content?.parts ?? []);
    return finalText || 'Sistem telah memproses data, namun AI gagal mengembalikan format yang sesuai.';
  }

  // ── Direct text response ──────────────────────────────────────────────────
  const text = getText(firstCandidate.content?.parts ?? []);
  return text || 'Maaf, sistem tidak bisa memproses permintaan ini.';
}
