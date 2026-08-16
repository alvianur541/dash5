
import { UnitModel } from './types';
import {
  searchTechnicalManualMulti,
  searchPartsCatalog,
  searchEngineManual,
} from './rag';
import { callProxy, getText, INTENT_MODEL, FunctionDeclaration } from './orchestrator';

export interface ToolResult {
  toolName: string;
  content: string;
  hasResults: boolean;
  confidence?: 'high' | 'medium' | 'low';
  topScore?: number;
  error?: string;
}

export interface Tool {
  declaration: FunctionDeclaration;
  execute: (args: Record<string, unknown>, model: UnitModel) => Promise<ToolResult>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStrArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string');
}

// ─── Tool 1: search_technical_manual ──────────────────────────────────────────

const searchTechnicalManualTool: Tool = {
  declaration: {
    name: 'search_technical_manual',
    description:
      'Cari fault code, troubleshooting procedure, gejala kerusakan dari Technical Manual / Workshop Manual. Pakai untuk diagnosis & symptom analysis. Return ranked chunks dari knowledge base manual unit yang dipilih.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Query teknis dalam English (mis. "swing motor slow response", "engine overheat heavy load"). Tidak boleh include nama model — model sudah difilter otomatis.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args, model) => {
    const query = String(args.query ?? '').trim();
    if (!query) return { toolName: 'search_technical_manual', content: '', hasResults: false, error: 'empty query' };
    const result = await searchTechnicalManualMulti([query], model);
    return {
      toolName: 'search_technical_manual',
      content: result.content,
      hasResults: result.hasResults,
      confidence: result.confidence,
      topScore: result.topScore,
      error: result.ragError,
    };
  },
};

// ─── Tool 2: search_parts_catalog ─────────────────────────────────────────────

const searchPartsCatalogTool: Tool = {
  declaration: {
    name: 'search_parts_catalog',
    description:
      'Cari Part Number, harga, ketersediaan dari Parts Catalog / Engine Parts Catalog / CPM schedule / semua periode PROMO aktif (harga periode terbaru diprioritaskan otomatis). Pakai untuk lookup PN spesifik, schedule maintenance per interval jam, harga promo terbaru.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Query pencarian parts (mis. "swing motor seal kit", "1000 hour service maintenance parts"). Bisa berupa PN literal, nama komponen, atau interval schedule.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args, model) => {
    const query = String(args.query ?? '').trim();
    if (!query) return { toolName: 'search_parts_catalog', content: '', hasResults: false, error: 'empty query' };
    // skipExpand=true karena query dari AI sudah English-optimized via reasoning step
    const result = await searchPartsCatalog(query, model, true);
    return {
      toolName: 'search_parts_catalog',
      content: result.content,
      hasResults: result.hasResults,
      confidence: result.confidence,
      topScore: result.topScore,
    };
  },
};

// ─── Tool 3: search_engine_manual ─────────────────────────────────────────────

const searchEngineManualTool: Tool = {
  declaration: {
    name: 'search_engine_manual',
    description:
      'Cari DTC P-code procedure dari Engine Manual (Yanmar 4TNV88 untuk ZX48U/65USB, Isuzu untuk ZX138/200). HANYA panggil setelah search_technical_manual return P-code di hasil. Jangan panggil tanpa P-code yang jelas.',
    parameters: {
      type: 'object',
      properties: {
        p_codes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array P-code yang ditemukan dari TM result (mis. ["P0340", "P1212"]). Max 3 codes.',
        },
      },
      required: ['p_codes'],
    },
  },
  execute: async (args, model) => {
    const pCodes = toStrArray(args.p_codes).slice(0, 3);
    if (pCodes.length === 0) {
      return { toolName: 'search_engine_manual', content: '', hasResults: false, error: 'no p_codes provided' };
    }
    const result = await searchEngineManual(pCodes, model);
    return {
      toolName: 'search_engine_manual',
      content: result.content,
      hasResults: result.hasResults,
      confidence: result.confidence,
      topScore: result.topScore,
    };
  },
};

// ─── Tool 4: search_circuit_diagram ───────────────────────────────────────────

const searchCircuitDiagramTool: Tool = {
  declaration: {
    name: 'search_circuit_diagram',
    description:
      'Cari spec sistem hidrolik — relief pressure, displacement pump/motor, control valve spec, port size. Pakai untuk pertanyaan tekanan/setting/spec hidrolik. Saat ini hanya ZX48U-5A yang punya data HCD lengkap.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Query spec hidrolik (mis. "main pump relief pressure MPa", "swing motor displacement").',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args, model) => {
    const query = String(args.query ?? '').trim();
    if (!query) return { toolName: 'search_circuit_diagram', content: '', hasResults: false, error: 'empty query' };
    const result = await searchTechnicalManualMulti([query], model, 3, 'HYDRAULIC CIRCUIT DIAGRAM');
    return {
      toolName: 'search_circuit_diagram',
      content: result.content,
      hasResults: result.hasResults,
      confidence: result.confidence,
      topScore: result.topScore,
      error: result.ragError,
    };
  },
};

// ─── Tool 5: decompose_query ──────────────────────────────────────────────────

const DECOMPOSE_SYSTEM = `You are a query decomposition specialist for Hitachi/KCM heavy equipment diagnostics.

TASK: Break queries with MULTIPLE DISTINCT issues into independent parallel sub-queries.
DO NOT decompose single-issue queries — return array with the original query translated to English.

OUTPUT: ONLY a JSON array of English strings. Max 4 items. No markdown fences. No preamble.
Each sub-query: 3-6 English words, ONE specific issue/component. NO model names.

DECOMPOSE when query has:
  - Multiple fault codes (CA2769 + W:1208)
  - Different components with different symptoms (swing slow + pump leak)
  - Fault code + unrelated symptom (CA2769 + engine overheat)

DO NOT decompose:
  - Single component query → ["swing motor slow response"]
  - Single fault code → ["CA2769 fault code"]
  - Parts lookup → ["swing motor seal kit price"]
  - Service interval → ["1000 hour maintenance parts"]

Examples:
Input: "swing lambat dan ada fault CA2769, tekanan juga drop"
Output: ["CA2769 fault code","swing motor slow response","hydraulic pressure drop"]

Input: "engine overheat saat beban berat, oli bocor di pump"
Output: ["engine overheat heavy load","main pump oil leak"]

Input: "harga seal kit swing motor"
Output: ["swing motor seal kit price"]

Input: "kenapa swing lambat"
Output: ["swing motor slow response"]`;

const decomposeQueryTool: Tool = {
  declaration: {
    name: 'decompose_query',
    description:
      'Pecah query yang punya >1 isu/komponen jadi sub-queries paralel. Panggil di AWAL kalau query mengandung multiple distinct issues (gejala berbeda, fault code + masalah lain, dll). JANGAN panggil untuk query single-issue.',
    parameters: {
      type: 'object',
      properties: {
        original_query: {
          type: 'string',
          description: 'Query asli dari user dalam bahasa apapun.',
        },
      },
      required: ['original_query'],
    },
  },
  execute: async (args) => {
    const query = String(args.original_query ?? '').trim();
    if (!query) {
      return { toolName: 'decompose_query', content: '[]', hasResults: false, error: 'empty query' };
    }
    try {
      const res = await callProxy(
        {
          contents: [{ role: 'user', parts: [{ text: `Decompose this query:\n"${query}"` }] }],
          systemInstruction: { parts: [{ text: DECOMPOSE_SYSTEM }] },
          generationConfig: { maxOutputTokens: 200, thinkingConfig: { thinkingLevel: 'minimal' } },
        },
        false,
        INTENT_MODEL,
      );
      const raw = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
      // Robust JSON extraction — toleran terhadap markdown fence atau text bocor
      const arrMatch = raw.match(/\[[\s\S]*?\]/);
      const subQueries = arrMatch ? toStrArray(JSON.parse(arrMatch[0])).slice(0, 4) : [];
      if (subQueries.length === 0) {
        return { toolName: 'decompose_query', content: JSON.stringify([query]), hasResults: false, error: 'parse failed, fallback to original' };
      }
      return {
        toolName: 'decompose_query',
        content: JSON.stringify(subQueries),
        hasResults: true,
      };
    } catch (err) {
      return {
        toolName: 'decompose_query',
        content: JSON.stringify([query]),
        hasResults: false,
        error: (err as Error)?.message ?? 'decompose call failed',
      };
    }
  },
};

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const TOOLS: Record<string, Tool> = {
  search_technical_manual: searchTechnicalManualTool,
  search_parts_catalog:    searchPartsCatalogTool,
  search_engine_manual:    searchEngineManualTool,
  search_circuit_diagram:  searchCircuitDiagramTool,
  decompose_query:         decomposeQueryTool,
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = Object.values(TOOLS).map(t => t.declaration);
