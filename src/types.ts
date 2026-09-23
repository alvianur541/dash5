// Unit list lives in cloudrun/src: only that folder is uploaded by `gcloud run deploy --source=cloudrun`.
export { UNIT_MODELS } from '@/cloudrun/src/types';
export type { UnitModel, Message, AgentEvent } from '@/cloudrun/src/types';

import type { UnitModel, Message } from '@/cloudrun/src/types';

export interface SessionMeta {
  id: string;
  title: string;
  model: UnitModel;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  model: UnitModel;
  messages: Message[];
}
