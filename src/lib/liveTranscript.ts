import type { Message } from '../types';

type LiveContent = {
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  turnComplete?: boolean;
  interrupted?: boolean;
};

// Turns streamed Live transcription chunks into growing chat bubbles.
export function createLiveTranscript(newId: () => string = () => crypto.randomUUID(), now: () => number = Date.now) {
  let open: Message | null = null;
  const add = (role: Message['role'], text?: string): Message[] => {
    if (!text) return [];
    if (!open || open.role !== role) open = { id: newId(), role, content: '', timestamp: now() };
    open = { ...open, content: open.content + text };
    return [open];
  };
  return {
    apply(c: LiveContent): Message[] {
      const changed = [...add('user', c.inputTranscription?.text), ...add('assistant', c.outputTranscription?.text)];
      if (c.turnComplete || c.interrupted) open = null;
      return changed;
    },
  };
}
