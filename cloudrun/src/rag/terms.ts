import { UNIT_MODELS } from '../types';


export function isFaultCode(query: string): boolean {
  return /^(?:[A-Z]{1,3}\s*:?\s*(?:\d{2,6}-[0-9A-F]{1,4}|\d{4,6})|\d{3,6}(?:-[0-9A-F]{1,4})?)$/i.test(query.trim());
}

const PARTS_KEYWORDS_RE = /\b(part\s*number\w*|part\s*no\.?|p\/?n[\s:]+\w|spare\s*part|suku\s*cadang|nomor\s*part|kode\s*part|harga\s*part|katalog\s*part|parts?\s*catalog|cross[-\s]?ref(?:erence)?|kompatibel|compatibility|substitu(?:te|si)|pengganti\s*part)\b/i;

const HARGA_COMPONENT_RE = /\b(?:harga|price)\s+(?:promo\s+)?(?:seal|kit|pump|valve|motor|cylinder|filter|gasket|bearing|o-?ring|element|hose|sensor|coupling|grease|oil|oli|coolant|breaker|controller|reman|rotor|piston|spring|nozzle|injector|alternator|starter|battery|belt|fan|radiator|shaft|roller|idler|sprocket|track|link|shoe|tooth|teeth|adapter|cutting\s*edge|undercarriage|bucket)\b/i;

const PART_NUMBER_RE = /\b([A-Z]{1,3}\d{5,8}-\d{4,6}|[A-Z]{1,3}\d{6,12}|\d{7,10}|\d{2,4}-\d{2,3}-\d{4,6}|\d[0-9A-Z]{4}-\d{5})\b/;

export function isPartsQuery(query: string): boolean {
  return PARTS_KEYWORDS_RE.test(query)
    || HARGA_COMPONENT_RE.test(query)
    || PART_NUMBER_RE.test(query.toUpperCase());
}

export function extractPartNumber(query: string): string | null {
  const match = query.toUpperCase().match(PART_NUMBER_RE);
  return match ? match[1].trim() : null;
}

export function extractSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (isFaultCode(trimmed)) {
    const spaced   = trimmed.replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1: $2');
    const unspaced = trimmed.replace(/^([A-Z]{1,3})\s*:\s*([0-9A-Fa-f]+)/i, '$1:$2');
    const numOnly  = trimmed.replace(/^[A-Z]{1,3}\s*:?\s*/i, '');
    const stripped = numOnly.replace(/-0+([0-9A-Fa-f]+)$/, '-$1');
    return [...new Set([trimmed, spaced, unspaced, numOnly, stripped])].filter(Boolean).slice(0, 5);
  }

  const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  if (words.length === 0) return [trimmed];

  const candidates: Array<{ text: string; score: number }> = [];
  for (let n = 3; n >= 2; n--) {
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n).join(' ');
      const score = words.slice(i, i + n).filter(w => TECH_TERMS.has(w)).length + (n === 3 ? 0.5 : 0);
      candidates.push({ text: gram, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  for (const c of candidates) {
    if (picked.length >= 2) break;
    if (!picked.some(p => p.includes(c.text) || c.text.includes(p))) picked.push(c.text);
  }

  return [trimmed, ...picked].slice(0, 3);
}

export function batangKata(w: string): string {
  if (w.length < 6) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'i';
  if (w.endsWith('y'))   return w.slice(0, -1);
  if (w.endsWith('es'))  return w.slice(0, -2);
  if (w.endsWith('s'))   return w.slice(0, -1);
  return w;
}

const MODEL_NAMES_RE = new RegExp(
  '\\b(' + UNIT_MODELS
    .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|') + ')(?:-\\w+)?\\b\\s*',
  'gi',
);

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, m => `\\${m}`).replace(/[,()]/g, ' ');
}

const MEASURED_VALUE_RE = /\b\d+(?:[.,]\d+)?\s*(?:v|volt|voltage|a|amp|ampere|ma|ohm|Ω|mpa|kpa|bar|psi|kgf\/cm2|kgf\/cm²|rpm|°c|derajat|mm|cm|kg|liter|l|jam|hr|hours?|%)\b\.?/gi;

export function stripMeasuredValues(query: string): string {
  const out = query.replace(MEASURED_VALUE_RE, ' ').replace(/\s+/g, ' ').trim();
  return out.split(/\s+/).length >= 2 ? out : query;
}

export function stripModelFromQuery(query: string): string {
  return stripMeasuredValues(query.replace(MODEL_NAMES_RE, '')).replace(/\s+/g, ' ').trim();
}

const EXPAND: Record<string, string> = {
  hidrolik: 'hydraulic', hidraulik: 'hydraulic', pompa: 'pump',
  katup: 'valve', silinder: 'cylinder', tangki: 'tank', selang: 'hose',
  akumulator: 'accumulator', tekanan: 'pressure', aliran: 'flow',
  mesin: 'engine', turbo: 'turbocharger', injektor: 'injector',
  nosel: 'nozzle', kompresi: 'compression',
  solar: 'diesel fuel', bahan: 'fuel', urea: 'DEF urea',
  aki: 'battery', starter: 'starter motor', sekring: 'fuse',
  kabel: 'wiring harness', bantalan: 'bearing',
  sepatu: 'shoe track', final: 'final drive', travel: 'travel motor',
  bocor: 'leak', kebocoran: 'leak', panas: 'overheat', macet: 'stuck',
  tersumbat: 'clogged', lemah: 'weak power', lambat: 'slow response',
  getaran: 'vibration', aus: 'wear', rusak: 'failure', kerusakan: 'failure',
  kendur: 'slack', mati: 'not working',
  oli: 'oil', minyak: 'oil', pendingin: 'coolant', gemuk: 'grease',
  kapasitas: 'capacity', celah: 'clearance', toleransi: 'tolerance',
  spesifikasi: 'specification', kalibrasi: 'calibration',
  suhu: 'temperature', temperatur: 'temperature', putaran: 'rpm rotation',
  torsi: 'torque', kecepatan: 'speed',
  perawatan: 'maintenance', servis: 'service',
  sistem: 'system', kopling: 'clutch', rem: 'brake', rantai: 'chain',
  cyl: 'cylinder', cyls: 'cylinders', cilinder: 'cylinder',
  kit: 'assembly o-ring',
  seal: 'o-ring gasket',
  asm: 'assembly', assy: 'assembly',
  pn: 'part number', nomor: 'number part',
  isi: 'capacity refill',
  cek: 'check inspect',
  jadwal: 'schedule maintenance interval',
  relief: 'valve pressure MPa',
  displacement: 'cm3 rev motor',
};

const TECH_TERMS = new Set([
  ...Object.keys(EXPAND),
  ...Object.values(EXPAND).flatMap(v => v.split(' ')),
  'bucket', 'arm', 'boom', 'blade', 'dozer', 'pump', 'main', 'pilot',
  'control', 'spool', 'port', 'cylinder', 'valve', 'primary', 'piston',
]);

export const STOP_WORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'ada', 'apa', 'bagaimana',
  'kenapa', 'mengapa', 'cara', 'tolong', 'bantu', 'mohon', 'dengan', 'untuk',
  'pada', 'dalam', 'oleh', 'atau', 'juga', 'sudah', 'bisa', 'tidak', 'apakah',
  'akan', 'saya', 'unit', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'how', 'what', 'why', 'when', 'where', 'please', 'help', 'tell', 'me', 'about',
]);

export const NUMERIC_INTENT_RE = /\b(berapa|nilai|standar|standard|spesifikasi|spec|minimum|minimal|maksimum|maksimal|normal|batas|limit|toleransi|range)\b/i;

export const SPEC_TERMS = new Set([
  'weight', 'berat', 'torque', 'torsi', 'pressure', 'tekanan', 'clearance',
  'displacement', 'capacity', 'kapasitas', 'rpm', 'voltage', 'tegangan',
  'resistance', 'flow', 'dimension', 'dimensi', 'gap', 'speed',
  'diameter', 'dia', 'length', 'panjang', 'width', 'lebar', 'height', 'tinggi',
  'thickness', 'tebal', 'size', 'ukuran', 'stroke', 'depth', 'bore',
]);

export function expandQuery(query: string): string {
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const w of query.toLowerCase().split(/\s+/)) {
    const exp = EXPAND[w];
    if (!exp) continue;
    for (const tok of exp.split(/\s+/)) {
      if (!tok || seen.has(tok)) continue;
      seen.add(tok);
      extras.push(tok);
      if (extras.length >= 3) break;
    }
    if (extras.length >= 3) break;
  }
  return extras.length ? `${query} ${extras.join(' ')}` : query;
}

// Workshop Manual names the main pump assembly "pump device"; its weight and R/I steps exist only under that name.
export function manualTerms(q: string): string {
  return /\bmain\s+pump\b/i.test(q) && /\b(?:weight|berat|removal|installation|install|disassembl\w*|assembl\w*|lifting)\b/i.test(q)
    ? q.replace(/\bmain\s+pump\b/gi, 'pump device')
    : q;
}
