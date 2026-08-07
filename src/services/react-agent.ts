// ReAct agent loop — frontend-orchestrated multi-step reasoning.
// AI pakai Gemini native function calling untuk pilih tool dari catalog.
// Loop: Reason → Act (tool) → Observe → Reason → ... → Final Answer (streamed).

import { UnitModel, Message } from '../types';
import { SYSTEM_PROMPT, jakartaTime } from '../constants';
import {
  callProxy,
  callProxyStream,
  getText,
  VContent,
  Part,
  MODEL,
} from './ai';
import { TOOLS, TOOL_DECLARATIONS, ToolResult } from './tools';

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done';
  tool?: string;
  found?: boolean;
  message?: string;
}

export interface AgentConfig {
  maxIterations?: number;
  timeoutMs?: number;
  onAgentEvent?: (event: AgentEvent) => void;
  onChunk?: (text: string) => void;
}

const DEFAULT_MAX_ITER = 4;
const DEFAULT_TIMEOUT  = 45_000;

// REACT_SYSTEM hanya berisi rule UNIK untuk agentic mode (tool selection + loop).
// Style, format, anti-halu, CARA BICARA sudah ada di SYSTEM_PROMPT yang di-prepend.
// Duplikasi dihapus untuk mengurangi token waste dan mencegah konflik instruksi.
const REACT_SYSTEM = `Dash⁵ agentic mode — SYSTEM_PROMPT tetap berlaku penuh (anti-halu, style, format, bahasa).

TOOL SELECTION:
- Query punya >1 isu berbeda (komponen berbeda / fault code + symptom tidak related) → decompose_query DULU
- Fault code / troubleshooting → search_technical_manual
- PN / harga / parts / interval maintenance → search_parts_catalog
- P-code muncul di TM result → WAJIB follow up search_engine_manual
- Hydraulic spec (relief pressure, displacement) → search_circuit_diagram (hanya ZX48U-5A; model lain → search_technical_manual)

INTERPRET TOOL RESULT:
- hasResults=false / content="" → data tidak ada, nyatakan tegas
- confidence=low → akui keterbatasan, arahkan ke manual fisik atau TSD
- confidence=medium → pakai "probable/kemungkinan"; reminder verifikasi natural & sekali saja, hanya untuk angka/PN kritis (JANGAN kalimat template berulang)
- confidence=high → jawab tegas, quote verbatim
- error → skip tool ini, synthesize dari hasil tool lain yang ada

LOOP: max 4 tool calls. Duplicate args diblok. Data cukup → langsung final answer.`;

interface LoopOutcome {
  finalText: string;
  observations: ToolResult[];
}

/**
 * Build conversation contents dari history pesan user/assistant + query baru.
 * Forward window 20 message terakhir (sama seperti generateResponseStream).
 */
function buildInitialContents(history: Message[], userInput: string, window = 20): VContent[] {
  const contents: VContent[] = history
    .slice(-window)
    .filter(m => m.content?.trim())
    .map(m => ({
      role: m.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: m.content }] as Part[],
    }));
  // Timestamp di user-turn, BUKAN system prompt — systemInstruction di loop ReAct
  // dikirim ulang tiap iterasi (sampai 4x per 1 pesan user), jadi harus byte-identical
  // antar call agar prompt caching bisa hit (lihat constants.ts).
  contents.push({ role: 'user', parts: [{ text: `[${jakartaTime()} WIB]\n${userInput}` }] });
  return contents;
}

/**
 * Execute single tool dengan dedup. Kalau toolName === 'decompose_query',
 * caller bertanggung jawab handle hasil array sub-queries (di runReActAgent).
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  model: UnitModel,
  callSet: Set<string>,
): Promise<ToolResult> {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { toolName, content: '', hasResults: false, error: `unknown tool: ${toolName}` };
  }
  const sig = `${toolName}|${JSON.stringify(args)}`;
  if (callSet.has(sig)) {
    return { toolName, content: 'Tool sudah dipanggil dengan params ini, tidak diulangi.', hasResults: false, error: 'duplicate call blocked' };
  }
  callSet.add(sig);
  try {
    return await tool.execute(args, model);
  } catch (err) {
    return { toolName, content: '', hasResults: false, error: (err as Error)?.message ?? 'tool execution failed' };
  }
}

/**
 * Handle decompose_query khusus — eksekusi sub-queries paralel via search_technical_manual + search_parts_catalog,
 * lalu gabung sebagai observasi teks. Jangan pakai functionResponse synthetic untuk nama tool
 * yang tidak dideklarasikan, karena Gemini bisa menolak history tool-call yang tidak valid.
 */
async function expandDecomposed(
  subQueries: string[],
  model: UnitModel,
  callSet: Set<string>,
  emit: (e: AgentEvent) => void,
): Promise<ToolResult[]> {
  // Untuk tiap sub-query → fan out ke TM + Parts paralel, ambil yang hasResults=true
  const results = await Promise.allSettled(
    subQueries.flatMap(q => [
      executeTool('search_technical_manual', { query: q }, model, callSet),
      executeTool('search_parts_catalog',    { query: q }, model, callSet),
    ]),
  );
  const flat: ToolResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      flat.push(r.value);
      emit({ type: 'tool_result', tool: r.value.toolName, found: r.value.hasResults });
    }
  }
  return flat;
}

/**
 * Format ToolResult sebagai JSON ringkas untuk masuk ke functionResponse.response.
 * AI akan baca object ini di iterasi berikutnya.
 */
function toFunctionResponse(toolName: string, result: ToolResult): { name: string; response: Record<string, unknown> } {
  return {
    name: toolName,
    response: {
      content: result.content || '',
      hasResults: result.hasResults,
      ...(result.confidence ? { confidence: result.confidence } : {}),
      ...(result.topScore !== undefined ? { topScore: Number(result.topScore.toFixed(2)) } : {}),
      ...(result.error ? { error: result.error } : {}),
    },
  };
}

/**
 * Cari functionCall part di response. Gemini bisa return text + functionCall mixed,
 * tapi function calling biasanya monopoli 1 part.
 */
function extractFunctionCall(parts: Part[]): { name: string; args: Record<string, unknown> } | null {
  for (const p of parts) {
    if ('functionCall' in p && p.functionCall?.name) {
      return p.functionCall;
    }
  }
  return null;
}

function extractPCodes(content: string): string[] {
  const matches = [...content.matchAll(/\bP\d{4}\b/gi)]
    .map(m => m[0].toUpperCase());
  return [...new Set(matches)].slice(0, 3);
}

/**
 * Force final answer setelah max iterations habis — toolConfig.mode = NONE
 * agar AI tidak bisa panggil tool lagi, harus return text. Stream output.
 */
async function forceFinalAnswer(
  contents: VContent[],
  systemInstruction: string,
  observations: ToolResult[],
  onChunk: (text: string) => void,
): Promise<string> {
  // 1500 (naik dari 500): potongan 500 char membuang langkah troubleshooting dari observasi —
  // jawaban akhir jadi tidak lengkap. 1500 muat prosedur penuh per tool result.
  const summary = observations
    .filter(o => o.hasResults)
    .map(o => `- ${o.toolName}: ${o.content.slice(0, 1500)}${o.content.length > 1500 ? '...' : ''}`)
    .join('\n');

  const forceMsg = `Iterations habis (max 4). Synthesize dari observations berikut ke final answer Bahasa Indonesia. Quote verbatim dari data — JANGAN ngarang.\n\nObservations:\n${summary || '(tidak ada data dari tools)'}`;

  // Append force prompt sebagai user turn
  const finalContents: VContent[] = [...contents, { role: 'user', parts: [{ text: forceMsg }] }];

  return callProxyStream(
    {
      contents: finalContents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'minimal' } },
      toolConfig: { functionCallingConfig: { mode: 'NONE' } },
    },
    onChunk,
  );
}

/**
 * Main loop — return final answer text. Throws kalau timeout atau total fail.
 */
export async function runReActAgent(
  query: string,
  model: UnitModel,
  userName: string,
  history: Message[],
  config: AgentConfig = {},
): Promise<string> {
  const maxIter = config.maxIterations ?? DEFAULT_MAX_ITER;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
  const emit = config.onAgentEvent ?? (() => {});
  const onChunk = config.onChunk ?? (() => {});

  const startedAt = Date.now();
  const checkTimeout = () => {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Agent timeout ${timeoutMs}ms`);
    }
  };

  const systemInstruction = `${SYSTEM_PROMPT(model, userName)}\n\n---\n\n${REACT_SYSTEM}`;
  const contents = buildInitialContents(history, query);
  const callSet = new Set<string>();
  const observations: ToolResult[] = [];

  let iterations = 0;
  let finalText = '';

  emit({ type: 'thinking', message: 'Menganalisa query…' });

  while (iterations < maxIter) {
    checkTimeout();

    // Reasoning step — minta AI pilih tool atau jawab
    const res = await callProxy({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' } },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    }, false, MODEL);

    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const fnCall = extractFunctionCall(parts);

    if (!fnCall) {
      // Final answer — AI return text, no more tool calls
      finalText = getText(parts).trim();
      console.info('[react-agent] iteration=%d finalAnswer chars=%d', iterations, finalText.length);
      break;
    }

    // Tool call branch
    iterations++;
    const { name, args } = fnCall;
    console.info('[react-agent] iteration=%d tool=%s args=%j', iterations, name, args);
    emit({ type: 'tool_call', tool: name });

    // Append model turn (functionCall) ke contents
    contents.push({ role: 'model', parts: [{ functionCall: { name, args } }] });

    // Special case decompose_query — eksekusi → expand sub-queries paralel
    if (name === 'decompose_query') {
      const decomposeResult = await executeTool(name, args, model, callSet);
      observations.push(decomposeResult);
      emit({ type: 'tool_result', tool: name, found: decomposeResult.hasResults });

      let subQueries: string[] = [];
      try { subQueries = JSON.parse(decomposeResult.content); } catch { subQueries = []; }
      console.info('[react-agent] decomposed into %d sub-queries: %j', subQueries.length, subQueries);

      // Jalankan fan-out sub-queries (kalau ada), lalu gabung SEMUA ke dalam SATU
      // functionResponse untuk decompose_query. Satu functionCall ↔ satu functionResponse,
      // tanpa extra turn / nama tool non-declared / dua user-turn berturut → contents valid,
      // tidak kena Gemini 400 ("function response without matching call" / role tidak alternasi).
      let synth = '';
      if (subQueries.length > 0) {
        emit({ type: 'thinking', message: `Mencari ${subQueries.length} aspek paralel…` });
        const fanOut = await expandDecomposed(subQueries, model, callSet, emit);
        observations.push(...fanOut);
        synth = fanOut
          .filter(r => r.hasResults)
          .map(r => `[${r.toolName}] ${r.content.slice(0, 800)}`)
          .join('\n\n---\n\n');
      }

      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'decompose_query',
            response: {
              sub_queries: subQueries,
              observations: synth || '(tidak ada hasil dari sub-queries)',
              hasResults: synth.length > 0,
            },
          },
        }],
      });
      continue;
    }

    // Regular tool execution
    const result = await executeTool(name, args, model, callSet);
    observations.push(result);
    emit({ type: 'tool_result', tool: name, found: result.hasResults });

    contents.push({ role: 'user', parts: [{ functionResponse: toFunctionResponse(name, result) }] });

    if (name === 'search_technical_manual' && result.hasResults) {
      const pCodes = extractPCodes(result.content);
      if (pCodes.length > 0) {
        emit({ type: 'tool_call', tool: 'search_engine_manual' });
        const engineResult = await executeTool('search_engine_manual', { p_codes: pCodes }, model, callSet);
        observations.push(engineResult);
        emit({ type: 'tool_result', tool: 'search_engine_manual', found: engineResult.hasResults });
        // Synthetic functionCall dulu — functionResponse tanpa functionCall pasangannya = Gemini 400.
        contents.push({ role: 'model', parts: [{ functionCall: { name: 'search_engine_manual', args: { p_codes: pCodes } } }] });
        contents.push({ role: 'user', parts: [{ functionResponse: toFunctionResponse('search_engine_manual', engineResult) }] });
      }
    }
  }

  // Stream final answer phase
  if (finalText) {
    // AI sudah produce text di loop — chunk-stream-it manually agar UI behavior konsisten
    const CHUNK = 80;
    for (let i = 0; i < finalText.length; i += CHUNK) {
      onChunk(finalText.slice(i, i + CHUNK));
    }
    emit({ type: 'done' });
    return finalText;
  }

  // Hit max iterations tanpa final answer → force final mode
  console.warn('[react-agent] max iterations (%d) hit, forcing final answer', maxIter);
  emit({ type: 'thinking', message: 'Menyusun jawaban…' });
  finalText = await forceFinalAnswer(contents, systemInstruction, observations, onChunk);
  emit({ type: 'done' });
  return finalText;
}
