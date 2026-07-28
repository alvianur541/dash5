
export type UnitModel = 'ZX48U-5A' | 'ZX65USB-5A' | 'ZX138MF-5G' | 'ZX200-5G' | 'KCM 60ZV' | 'ZW140';

// Ilmu lapangan yang DIDETEKSI + DIEKSTRAK AI dari pesan teknisi (bukan diisi manual).
// Dipakai memicu kartu "kamu berbagi ilmu — simpan?" (teknisi tinggal konfirmasi).
export interface KnowledgeCandidate {
  component: string;   // komponen/sistem yang dibahas (hasil ekstraksi AI)
  note: string;        // ringkasan ilmu/trik yang AI tangkap dari ucapan teknisi
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: string[];
  knowledgeCandidate?: KnowledgeCandidate;   // set kalau AI mendeteksi teknisi berbagi ilmu
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
