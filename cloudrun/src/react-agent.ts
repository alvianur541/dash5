
import { UnitModel, Message } from './types';
import { SYSTEM_PROMPT, jakartaTime } from './constants';
import {
  callProxy,
  callProxyStream,
  getText,
  extractRelatedPCodes,
  VContent,
  Part,
  MODEL,
} from './orchestrator';
import { extractSearchTerms } from './rag';
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

function buildInitialContents(history: Message[], userInput: string, window = 20): VContent[] {
  const contents: VContent[] = history
    .slice(-window)
    .filter(m => m.content?.trim())
    .map(m => ({
      role: m.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: m.content }] as Part[],
    }));
  contents.push({ role: 'user', parts: [{ text: `[${jakartaTime()} WIB]\n${userInput}` }] });
  return contents;
}

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

function extractFunctionCall(parts: Part[]): { name: string; args: Record<string, unknown> } | null {
  for (const p of parts) {
    if ('functionCall' in p && p.functionCall?.name) {
      return p.functionCall;
    }
  }
  return null;
}


async function forceFinalAnswer(
  contents: VContent[],
  systemInstruction: string,
  observations: ToolResult[],
  onChunk: (text: string) => void,
): Promise<string> {
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
      generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } },
      toolConfig: { functionCallingConfig: { mode: 'NONE' } },
    },
    onChunk,
  );
}

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
      generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } },
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

    // Kirim parts APA ADANYA — menyusun ulang jadi [{ functionCall }] membuang thoughtSignature.
    contents.push({ role: 'model', parts });

    // Special case decompose_query — eksekusi → expand sub-queries paralel
    if (name === 'decompose_query') {
      const decomposeResult = await executeTool(name, args, model, callSet);
      observations.push(decomposeResult);
      emit({ type: 'tool_result', tool: name, found: decomposeResult.hasResults });

      let subQueries: string[] = [];
      try { subQueries = JSON.parse(decomposeResult.content); } catch { subQueries = []; }
      console.info('[react-agent] decomposed into %d sub-queries: %j', subQueries.length, subQueries);

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
      // Ekstraksi P-code WAJIB sama dengan jalur deterministik: hanya dari baris yang relevan
      // dengan query. Versi global (/\bP\d{4}\b/g) pernah dibuang karena chunk "Engine Fault Code
      // List" memuat 30+ P-code → 30+ embed call + isi Engine Manual yang tak nyambung.
      const kueri = typeof (args as { query?: unknown })?.query === 'string'
        ? (args as { query: string }).query
        : query;
      const pCodes = extractRelatedPCodes(result.content, extractSearchTerms(kueri));
      if (pCodes.length > 0) {
        emit({ type: 'tool_call', tool: 'search_engine_manual' });
        const engineResult = await executeTool('search_engine_manual', { p_codes: pCodes }, model, callSet);
        observations.push(engineResult);
        emit({ type: 'tool_result', tool: 'search_engine_manual', found: engineResult.hasResults });
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
