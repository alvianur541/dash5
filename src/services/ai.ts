/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../constants';
import { UnitModel, Message } from '../types';
import { searchTechnicalManual } from './supabase';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const MODEL_ID = 'claude-sonnet-4-6';

const searchTool: Anthropic.Tool = {
  name: 'searchTechnicalManual',
  description:
    'Search the heavy equipment technical manual for components, fault codes, or procedures. ' +
    'DO NOT include the unit model name in the query — it is filtered automatically by the system.',
  input_schema: {
    type: 'object' as const,
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

async function fileToImageBlock(file: File): Promise<Anthropic.ImageBlockParam> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: base64,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── OCR: Extract fault codes from images ──────────────────────────────────────
async function extractFaultCodesFromImages(imageBlocks: Anthropic.ImageBlockParam[]): Promise<string[]> {
  const ocrResponse = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 300,
    system:
      'You are an OCR specialist for heavy equipment diagnostic systems. ' +
      'Your ONLY task is to extract fault codes, error codes, warning codes, or diagnostic codes from the image. ' +
      'Return ONLY the codes separated by commas (e.g., "CA2769, E03, F0255"). ' +
      'If no codes are found, return exactly: NONE. ' +
      'Do not include explanations, descriptions, or any other text.',
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: 'Extract all fault codes visible in this image.' },
        ],
      },
    ],
  });

  const raw = ocrResponse.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() || 'NONE';

  if (raw === 'NONE' || raw === '') return [];

  // Parse comma-separated codes, clean whitespace
  return raw.split(',').map(c => c.trim()).filter(Boolean);
}

export async function generateResponse(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  attachments?: File[]
): Promise<string> {
  const systemInstruction = SYSTEM_PROMPT(model, userName);

  // Build conversation history — skip messages with empty content
  const messages: Anthropic.MessageParam[] = history
    .filter(msg => msg.content && msg.content.trim().length > 0)
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

  // Build current user message (text + optional images)
  const currentContent: Anthropic.ContentBlockParam[] = [];

  let preSearchedResults: string | null = null;

  if (attachments && attachments.length > 0) {
    const imageBlocks = await Promise.all(attachments.map(fileToImageBlock));
    currentContent.push(...imageBlocks);

    try {
      // ── OCR Step: Extract fault codes from images ──
      const faultCodes = await extractFaultCodesFromImages(imageBlocks);

      if (faultCodes.length > 0) {
        // ── Pre-search each extracted fault code ──
        const searchResults: string[] = [];
        for (const code of faultCodes) {
          try {
            const result = await searchTechnicalManual(code, model);
            if (result) searchResults.push(`[Fault Code: ${code}]\n${result}`);
          } catch {
            // ignore individual search failures
          }
        }

        if (searchResults.length > 0) {
          preSearchedResults = searchResults.join('\n\n===\n\n');
        }

        const ocrNote =
          `Fault code terdeteksi dari gambar: **${faultCodes.join(', ')}**\n\n` +
          (userInput || 'Analisa fault code ini dan berikan diagnosis lengkap.');

        const contextNote = preSearchedResults
          ? `${ocrNote}\n\n[DATA MANUAL TERSEDIA — gunakan data ini untuk analisis]\n${preSearchedResults}`
          : ocrNote;

        currentContent.push({ type: 'text', text: contextNote });
      } else {
        const text = userInput || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.';
        currentContent.push({ type: 'text', text });
      }
    } catch {
      // OCR failed — fallback: send image + original text to Claude directly
      const text = userInput || 'Analisa gambar ini, identifikasi fault code yang terlihat, dan berikan diagnosis lengkap.';
      currentContent.push({ type: 'text', text });
    }
  } else {
    // No attachments — only push text if non-empty
    const text = userInput.trim();
    if (text) currentContent.push({ type: 'text', text });
  }

  // Guard: ensure currentContent is not empty
  if (currentContent.length === 0) {
    currentContent.push({ type: 'text', text: 'Halo' });
  }

  messages.push({ role: 'user', content: currentContent });

  // ── First call — may trigger additional tool use ──
  const firstResponse = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    system: systemInstruction,
    messages,
    tools: [searchTool],
  });

  // ── Handle tool use (additional searches Claude decides to make) ──
  if (firstResponse.stop_reason === 'tool_use') {
    const toolUseBlocks = firstResponse.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === 'searchTechnicalManual') {
        const { query } = toolUse.input as { query: string };
        const searchResult = await searchTechnicalManual(query, model);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            searchResult ||
            'No relevant data found in the technical manual database. ' +
            'Proceed to answer using expert internal knowledge.',
        });
      }
    }

    messages.push({ role: 'assistant', content: firstResponse.content });
    messages.push({ role: 'user', content: toolResults });

    const finalResponse = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 4096,
      system: systemInstruction,
      messages,
    });

    const textBlock = finalResponse.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    return (
      textBlock?.text ||
      'Sistem telah memproses data, namun AI gagal mengembalikan format yang sesuai.'
    );
  }

  // ── Direct text response ──
  const textBlock = firstResponse.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  return textBlock?.text || 'Maaf, sistem tidak bisa memproses permintaan ini.';
}
