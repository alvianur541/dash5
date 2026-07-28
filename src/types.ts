
export type UnitModel = 'ZX48U-5A' | 'ZX65USB-5A' | 'ZX138MF-5G' | 'ZX200-5G' | 'KCM 60ZV' | 'ZW140';

// Sinyal "knowledge base tidak punya data untuk pertanyaan ini" — dipakai untuk
// memicu tawaran Catatan Lapangan (crowd-source ilmu teknisi menambal gap KB).
export type GapReason =
  | 'not_found'       // fault code / parts tidak ada di KB (canned)
  | 'web_fallback'    // manual internal kosong → fallback referensi umum/web
  | 'partial';        // ada data nyerempet tapi jawaban akui bagian penting tak termuat

export interface KnowledgeGap {
  reason: GapReason;
  topic: string;      // pertanyaan/topik yang datanya tidak ditemukan
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: string[];
  knowledgeGap?: KnowledgeGap;   // set kalau jawaban ini mentok karena KB tak punya data
}

export interface SessionMeta {
  id: string;
  title: string;       // First user message, truncated
  model: UnitModel;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  model: UnitModel;
  messages: Message[];
}
