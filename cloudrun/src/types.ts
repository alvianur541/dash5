/**
 * SATU-SATUNYA daftar model. Menambah unit cukup di sini — `UnitModel`, regex strip nama model,
 * dan allowlist `/v1/ask` semuanya diturunkan dari sini. Dulu tersebar di empat tempat dan
 * gampang ada yang tertinggal saat menambah model.
 */
export const UNIT_MODELS = [
  'ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G', 'KCM 60ZV', 'ZW140',
] as const;

export type UnitModel = typeof UNIT_MODELS[number];

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: string[];
}

/** Gambar yang sudah dikonversi browser — server tidak punya File/FileReader. */
export interface InlineImage { mimeType: string; data: string }

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done';
  tool?: string;
  found?: boolean;
  message?: string;
}
