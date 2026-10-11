import type { Message } from '../types';

type LiveContent = {
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  turnComplete?: boolean;
  interrupted?: boolean;
};

const DIGIT: Record<string, number> = { nol: 0, kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
const MULT = ['puluh', 'belas', 'ratus', 'ribu', 'juta', 'miliar', 'sepuluh', 'sebelas', 'seratus', 'seribu'];
const D = Object.keys(DIGIT).join('|');
const W = `(?:${D}|${MULT.join('|')})`;
const RUN = new RegExp(`\\b${W}(?:\\s+${W})*\\b`, 'gi');

const dots = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function spokenValue(words: string[]): number {
  let total = 0, group = 0, last = 0;
  for (const w of words) {
    if (w in DIGIT) { group += last; last = DIGIT[w]; continue; }
    if (w === 'sepuluh') group += 10;
    else if (w === 'sebelas') group += 11;
    else if (w === 'seratus') group += 100;
    else if (w === 'seribu') total += 1000;
    else if (w === 'puluh') group += last * 10;
    else if (w === 'belas') group += 10 + last;
    else if (w === 'ratus') group += last * 100;
    else if (w === 'ribu') { total += (group + last) * 1000; group = 0; }
    else if (w === 'juta') { total += (group + last) * 1e6; group = 0; }
    else if (w === 'miliar') { total += (group + last) * 1e9; group = 0; }
    last = 0;
  }
  return total + group + last;
}

// Speech transcripts spell numbers out ("ZX dua ratus dash lima G"); show them as the text chat does.
export function tidyTranscript(text: string): string {
  const digits = (s: string) => s.toLowerCase().split(/\s+/).map(w => DIGIT[w]).join('');
  return text
    .replace(/\b(Z[XW])(?=[a-z])/g, '$1 ')
    .replace(new RegExp(`\\b(${D})\\s+koma\\s+((?:${D})(?:\\s+(?:${D}))*)\\b`, 'gi'), (_, a, b) => `${digits(a)},${digits(b)}`)
    .replace(new RegExp(`\\b(dash|strip)\\s+(${D})\\b`, 'gi'), (_, d, n) => `${d} ${digits(n)}`)
    .replace(RUN, run => {
      const words = run.toLowerCase().split(/\s+/);
      if (words.some(w => MULT.includes(w))) return dots(spokenValue(words));
      return words.length >= 2 ? digits(run) : run;
    })
    .replace(/\b(Z[XW])\s*(\d+)\s*([A-Z]{0,3})\s*(?:dash|strip|-)\s*(\d)\s*([A-Z])\b/g, '$1$2$3-$4$5')
    .replace(/\b(Z[XW])\s+(\d+)\b/g, '$1$2')
    .replace(/(\d{4,})\s+((?:[A-Z]-)+[A-Z])\b/g, (_, n, l) => n + l.replace(/-/g, ''));
}

// Turns streamed Live transcription chunks into growing chat bubbles.
export function createLiveTranscript(newId: () => string = () => crypto.randomUUID(), now: () => number = Date.now) {
  let open: Message | null = null;
  let raw = '';
  let locked = false;
  const add = (role: Message['role'], text?: string): Message[] => {
    if (!text) return [];
    if (role === 'assistant' && locked) return [];
    if (!open || open.role !== role) { open = { id: newId(), role, content: '', timestamp: now() }; raw = ''; }
    raw += text;
    open = { ...open, content: tidyTranscript(raw) };
    return [open];
  };
  return {
    apply(c: LiveContent): Message[] {
      const changed = [...add('user', c.inputTranscription?.text), ...add('assistant', c.outputTranscription?.text)];
      if (c.turnComplete || c.interrupted) { open = null; raw = ''; locked = false; }
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
