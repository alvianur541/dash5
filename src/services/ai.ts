/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * All Anthropic API calls go through /api/anthropic/v1/messages (proxy).
 * API keys are NEVER included in the browser bundle.
 */

import { SYSTEM_PROMPT } from '../constants';
import { UnitModel, Message } from '../types';
import { searchTechnicalManual } from './supabase';

const PROXY_URL  = '/api/anthropic/v1/messages';
const MODEL_ID   = 'claude-sonnet-4-6';

// ── Minimal inline types (no SDK dependency) ─────────────────────────────────
type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

interface TextBlock      { type: 'text';        text: string }
interface ImageBlock     { type: 'image';       source: { type: 'base64'; media_type: MediaType; data: string } }
interface ToolUseBlock   { type: 'tool_use';    id: string; name: string; input: Record<string, unknown> }
interface ToolResultBlock{ type: 'tool_result'; tool_use_id: string; content: string }

type ContentBlock   = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;
type MessageContent = string | ContentBlock[];

interface ApiMessage  { role: 'user' | 'assistant'; content: MessageContent }
interface ApiResponse { content: ContentBlock[]; stop_reason: string }

// ── Tool schema ───────────────────────────────────────────────────────────────
const searchTool = {
  name: 'searchTechnicalManual',
  description:
    'Search the heavy equipment technical manual for components, fault codes, or procedures. ' +
    'DO NOT include the unit model name in the query — it is filtered automatically by the system.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Core technical keywords, symptom description, system name, or fault code. Exclude the machine model name.',
      },
    },
    required: ['query'],
  },
};

// ── Proxy helper ──────────────────────────────────────────────────────────────
async function callAnthropic(body: object): Promise<ApiResponse> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic proxy ${res.status}: ${err}`);
  }
  return res.json();
}

// ── File → base64 image block ─────────────────────────────────────────────────
async function fileToImageBlock(file: File): Promise<ImageBlock> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({
        type: 'image',
        source: { type: 'base64', media_type: file.type as MediaType, data: base64 },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── OCR: extract fault codes from images ──────────────────────────────────────
async function extractFaultCodes(imageBlocks: ImageBlock[]): Promise<string[]> {
  const response = await callAnthropic({
    model: MODEL_ID,
    max_tokens: 300,
    system:
      'You are an OCR specialist for heavy equipment diagnostic systems. ' +
      'Your ONLY task is to extract fault codes, error codes, warning codes, or diagnostic codes from the image. ' +
      'Return ONLY the codes separated by commas (e.g., "CA2769, E03, F0255"). ' +
      'If no codes are found, return exactly: NONE. ' +
      'Do not include explanations, descriptions, or any other text.',
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        { type: 'text', text: 'Extract all fault codes visible in this image.' },
      ],
    }],
  });

  const raw = response.content.find((b): b is TextBlock => b.type === 'text')?.text?.trim() ?? 'NONE';
  if (raw === 'NONE' || raw === '') return [];
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
  const system = SYSTEM_PROMPT(model, userName);

  const messages: ApiMessage[] = history
    .filter(m => m.content?.trim())
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  const currentContent: ContentBlock[] = [];

  if (attachments && attachments.length > 0) {
    const imageBlocks = await Promise.all(attachments.map(fileToImageBlock));
    currentContent.push(...imageBlocks);

    try {
      const faultCodes = await extractFaultCodes(imageBlocks);

      if (faultCodes.length > 0) {
        const searchResults: string[] = [];
        for (const code of faultCodes) {
          try {
            const result = await searchTechnicalManual(code, model);
            if (result) searchResults.push(`[Fault Code: ${code}]\n${result}`);
          } catch { /* ignore */ }
        }

        const ocrNote =
          `Fault code terdeteksi dari gambar: **${faultCodes.join(', ')}**\n\n` +
          (userInput || 'Analisa fault code ini dan berikan diagnosis lengkap.');

        const contextNote = searchResults.length > 0
          ? `${ocrNote}\n\n[DATA MANUAL TERSEDIA — gunakan data ini untuk analisis]\n${searchResults.join('\n\n===\n\n')}`
          : ocrNote;

        currentContent.push({ type: 'text', text: contextNote });
      } else {
        currentContent.push({
          type: 'text',
          text: userInput || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.',
        });
      }
    } catch {
      currentContent.push({
        type: 'text',
        text: userInput || 'Analisa gambar ini, identifikasi fault code yang terlihat, dan berikan diagnosis lengkap.',
      });
    }
  } else {
    const text = userInput.trim();
    if (text) currentContent.push({ type: 'text', text });
  }

  if (currentContent.length === 0) currentContent.push({ type: 'text', text: 'Halo' });

  messages.push({ role: 'user', content: currentContent });

  // ── First call (may trigger tool use) ────────────────────────────────────────
  const first = await callAnthropic({ model: MODEL_ID, max_tokens: 4096, system, messages, tools: [searchTool] });

  if (first.stop_reason === 'tool_use') {
    const toolUseBlocks = first.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

    const toolResults: ToolResultBlock[] = [];
    for (const tu of toolUseBlocks) {
      if (tu.name === 'searchTechnicalManual') {
        const { query } = tu.input as { query: string };
        const result = await searchTechnicalManual(query, model);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result || 'No relevant data found. Proceed with expert internal knowledge.',
        });
      }
    }

    messages.push({ role: 'assistant', content: first.content });
    messages.push({ role: 'user', content: toolResults });

    const final = await callAnthropic({ model: MODEL_ID, max_tokens: 4096, system, messages });
    return final.content.find((b): b is TextBlock => b.type === 'text')?.text
      ?? 'Sistem telah memproses data, namun AI gagal mengembalikan format yang sesuai.';
  }

  return first.content.find((b): b is TextBlock => b.type === 'text')?.text
    ?? 'Maaf, sistem tidak bisa memproses permintaan ini.';
}
