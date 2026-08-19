
export type UnitModel = 'ZX48U-5A' | 'ZX65USB-5A' | 'ZX138MF-5G' | 'ZX200-5G' | 'KCM 60ZV' | 'ZW140';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: string[];
}

export interface SessionMeta {
  id: string;
  title: string;  // First message.
  model: UnitModel;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  model: UnitModel;
  messages: Message[];
}
