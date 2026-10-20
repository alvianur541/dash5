export const UNIT_MODELS = [
  'ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G', 'KCM 60ZV', 'ZW140',
] as const;

export type UnitModel = typeof UNIT_MODELS[number];

export interface PresentationSource {
  documentId: string;
  title: string;
  category: string;
  section?: string;
  revision?: string;
}

export interface SpecValueBlock {
  type: 'spec_value';
  label: string;
  value: string;
  unit: string;
  alternateValues?: Array<{ value: string; unit: string }>;
  facts?: Array<{ label: string; value: string }>;
  unitModel: UnitModel;
  sources: PresentationSource[];
}

export interface TechnicalNewsBlock {
  type: 'technical_news';
  bulletinId?: string;
  date?: string;
  title: string;
  affectedModels: UnitModel[];
  sources: PresentationSource[];
}

export interface MarkdownBlock {
  type: 'markdown';
  content: string;
}

export type AnswerPresentationBlockV1 = SpecValueBlock | TechnicalNewsBlock | MarkdownBlock;

export interface AnswerPresentationV1 {
  version: 1;
  blocks: AnswerPresentationBlockV1[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: string[];
  presentation?: AnswerPresentationV1;
}

export interface InlineImage { mimeType: string; data: string }

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result';
  tool?: string;
  found?: boolean;
  message?: string;
}
