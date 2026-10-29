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

const EN_DIGIT: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const EN_TEEN: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const EN_MULT: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const ED = Object.keys(EN_DIGIT).join('|');
const EW = `(?:${[ED, ...Object.keys(EN_TEEN), ...Object.keys(EN_TENS), ...Object.keys(EN_MULT)].join('|')})`;
const EN_RUN = new RegExp(`\\b${EW}(?:[\\s-]+${EW})*\\b`, 'gi');
const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function englishNumber(words: string[]): string {
  const parts: string[] = [];
  let total = 0, group = 0, small = 0, prev = '', has = false;
  const flush = () => { if (has) parts.push(String(total + group + small)); total = group = small = 0; has = false; };
  for (const w of words) {
    if (w in EN_DIGIT) { if (prev === 'digit' || prev === 'teen') flush(); small += EN_DIGIT[w]; prev = 'digit'; }
    else if (w in EN_TEEN || w in EN_TENS) { if (prev === 'digit' || prev === 'teen' || prev === 'tens') flush(); small = EN_TEEN[w] ?? EN_TENS[w]; prev = w in EN_TEEN ? 'teen' : 'tens'; }
    else if (w === 'hundred') { group += (small || 1) * 100; small = 0; prev = 'mult'; }
    else { total += (group + small || 1) * EN_MULT[w]; group = small = 0; prev = 'mult'; }
    has = true;
  }
  flush();
  return parts.length > 1 ? parts.join('') : commas(Number(parts[0]));
}

export function tidyTranscript(text: string): string {
  const digits = (s: string) => s.toLowerCase().split(/\s+/).map(w => DIGIT[w]).join('');
  const enDigits = (s: string) => s.toLowerCase().split(/\s+/).map(w => EN_DIGIT[w]).join('');
  return text
    .replace(/\b(hundred|thousand)\s+and\s+/gi, '$1 ')
    .replace(/\ba\s+(hundred|thousand)\b/gi, 'one $1')
    .replace(new RegExp(`\\b(${ED})\\s+point\\s+((?:${ED})(?:\\s+(?:${ED}))*)\\b`, 'gi'), (_, a, b) => `${enDigits(a)}.${enDigits(b)}`)
    .replace(new RegExp(`\\bzaxis\\s+(?=\\d|${W}\\b|${EW}\\b)`, 'gi'), 'ZX ')
    .replace(new RegExp(`\\b(dash)\\s+(${ED})\\b`, 'gi'), (_, d, n) => `${d} ${enDigits(n)}`)
    .replace(EN_RUN, run => {
      const words = run.toLowerCase().split(/[\s-]+/);
      return words.length === 1 && words[0] in EN_DIGIT ? run : englishNumber(words);
    })
    .replace(/\b(Z[XW])(?=[a-z])/g, '$1 ')
    .replace(new RegExp(`\\b(${D})\\s+koma\\s+((?:${D})(?:\\s+(?:${D}))*)\\b`, 'gi'), (_, a, b) => `${digits(a)},${digits(b)}`)
    .replace(new RegExp(`\\b(dash|strip)\\s+(${D})\\b`, 'gi'), (_, d, n) => `${d} ${digits(n)}`)
    .replace(RUN, run => {
      const words = run.toLowerCase().split(/\s+/);
      if (words.some(w => MULT.includes(w))) return dots(spokenValue(words));
      return words.length >= 2 ? digits(run) : run;
    })
    .replace(/\bzaxis\s+wheel\s+loader\s+140\b/gi, 'ZW140')
    .replace(/\bkawasaki\s+loader\s+60\s*Z\s*V\b/gi, 'KCM60ZV')
    .replace(/\b(Z[XW])\s*(\d+)\s*([A-Z]{0,3})\s*(?:dash|strip|-)\s*(\d)\s*([A-Z])\b/g, '$1$2$3-$4$5')
    .replace(/\b(Z[XW])\s+(\d+)\b/g, '$1$2')
    .replace(/(\d{4,})\s+((?:[A-Z]-)+[A-Z])\b/g, (_, n, l) => n + l.replace(/-/g, ''))
    .replace(/\b(tahun|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d)\.(\d{3})\b/gi, '$1 $2$3')
    .replace(/\b(year|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d),(\d{3})\b/gi, '$1 $2$3');
}

const TOOL_ECHO_RE = /\s*\[(?:HASIL|STATUS) ALAT[\s\S]*$/i;

export function createLiveTranscript(newId: () => string = () => crypto.randomUUID(), now: () => number = Date.now) {
  let open: Message | null = null;
  let raw = '';
  let locked = false;
  let waiting = false;
  let gap = false;
  const add = (role: Message['role'], text?: string): Message[] => {
    if (!text) return [];
    if (role === 'assistant' && locked) return [];
    if (role === 'user') { locked = false; waiting = false; }
    if (!open || open.role !== role) { open = { id: newId(), role, content: '', timestamp: now(), source: role === 'user' ? 'voice' : undefined }; raw = ''; }
    raw += gap && raw && !/\s$/.test(raw) && !/^\s/.test(text) ? ' ' + text : text;
    gap = false;
    open = { ...open, content: tidyTranscript(raw).replace(TOOL_ECHO_RE, '') };
    return [open];
  };
  return {
    apply(c: LiveContent): Message[] {
      const changed = [...add('user', c.inputTranscription?.text), ...add('assistant', c.outputTranscription?.text)];
      if (c.turnComplete || c.interrupted) {
        if (waiting && open?.role === 'assistant') gap = true;
        else { open = null; raw = ''; }
      }
      return changed;
    },
    searching() { waiting = true; },
    answer(text: string): Message[] {
      if (!open || open.role !== 'assistant') open = { id: newId(), role: 'assistant', content: '', timestamp: now() };
      open = { ...open, content: text };
      locked = true; waiting = false;
      return [open];
    },
  };
}
