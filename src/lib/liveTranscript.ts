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
  let locked = false;
  const add = (role: Message['role'], text?: string): Message[] => {
    if (!text) return [];
    if (role === 'assistant' && locked) return [];
    if (!open || open.role !== role) open = { id: newId(), role, content: '', timestamp: now() };
    open = { ...open, content: open.content + text };
    return [open];
  };
  return {
    apply(c: LiveContent): Message[] {
      const changed = [...add('user', c.inputTranscription?.text), ...add('assistant', c.outputTranscription?.text)];
      if (c.turnComplete || c.interrupted) { open = null; locked = false; }
      return changed;
    },
    // Exact tool text (digits, PN, tables) replaces the spoken transcript for this turn.
    answer(text: string): Message[] {
      if (!open || open.role !== 'assistant') open = { id: newId(), role: 'assistant', content: '', timestamp: now() };
      open = { ...open, content: text };
      locked = true;
      return [open];
    },
  };
}
