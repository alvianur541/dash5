import { deps } from '../deps';

export interface WebPart { pn: string; nama: string; harga: string }

const URL_CARI = 'https://hexindoparts.com/products?query=';
const BATAS_MS = 3_000;
const CACHE_MS = 6 * 3600_000;
const CACHE_MAX = 500;
const MAKS_PN = 12;
const cache = new Map<string, { t: number; v: WebPart[] }>();

const rupiah = (n: number): string => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

// Exact PN or a short letter suffix (PU, RCP, HPB, -F); prefix hits like 4658521 → 46585219 are rejected.
const cocok = (pn: string, nama: string): boolean => {
  const n = nama.toUpperCase().replace(/\s+/g, ' ').trim();
  return n === pn || (n.startsWith(pn) && /^-?[A-Z]{1,4}$/.test(n.slice(pn.length)));
};

// Real lookup against the hexindoparts.com JSON listing; wired into deps().webPrice by server.js.
export async function fetchHexParts(pn: string, signal?: AbortSignal): Promise<WebPart[]> {
  const kunci = pn.toUpperCase().trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BATAS_MS);
  const lepas = () => ctrl.abort();
  signal?.addEventListener('abort', lepas);
  try {
    const res = await fetch(URL_CARI + encodeURIComponent(kunci), {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0 (HexindoTechnicalAssistant)' },
      signal: ctrl.signal,
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
      console.warn('[hexparts] %s status=%d type=%s', kunci, res.status, res.headers.get('content-type'));
      return [];
    }
    const data = await res.json() as { products?: { data?: Array<{ name?: string; short_description?: string; price?: { amount?: string | number } }> } };
    return (data.products?.data ?? [])
      .filter(p => p.name && cocok(kunci, p.name) && Number(p.price?.amount) > 0)
      .slice(0, 4)
      .map(p => ({ pn: p.name!.trim(), nama: (p.short_description ?? '').trim(), harga: rupiah(Number(p.price!.amount)) }));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', lepas);
  }
}

export async function hargaWeb(pns: string[]): Promise<Map<string, WebPart[]>> {
  const hasil = new Map<string, WebPart[]>();
  const cari = deps().webPrice;
  const daftar = [...new Set(pns.map(p => p.toUpperCase().trim()).filter(p => p.length >= 4))].slice(0, MAKS_PN);
  if (!cari || !daftar.length) return hasil;
  const t0 = Date.now();
  await Promise.all(daftar.map(async pn => {
    const c = cache.get(pn);
    if (c && Date.now() - c.t < CACHE_MS) { if (c.v.length) hasil.set(pn, c.v); return; }
    try {
      const v = await cari(pn);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(pn, { t: Date.now(), v });
      if (v.length) hasil.set(pn, v);
    } catch (err) {
      console.warn('[hexparts] %s gagal: %s', pn, (err as Error)?.message);
    }
  }));
  console.info('[hexparts] %d PN → %d ketemu (%dms)', daftar.length, hasil.size, Date.now() - t0);
  return hasil;
}

export function resetHargaWebCache(): void { cache.clear(); }

export function blokHargaWeb(hasil: Map<string, WebPart[]>): string {
  if (!hasil.size) return '';
  const baris = [...hasil.values()].flat().map(p => `  ${p.pn.padEnd(22)} | ${p.nama.padEnd(30)} | ${p.harga}`);
  return `[HARGA HEXINDOPARTS.COM — harga terkini toko online resmi Hexindo]\n  Part Number            | Description                    | Harga\n${baris.join('\n')}`;
}

const BUKAN_KATA = new Set(['harga', 'hargany', 'hargannya', 'harganya', 'price', 'prices', 'berapa', 'brp', 'berpa', 'cek', 'check', 'ada', 'ngga', 'nggak', 'gak', 'tidak', 'part', 'parts', 'number', 'nomor', 'unit', 'model', 'yang', 'untuk', 'buat', 'dan', 'atau', 'klo', 'kalau', 'kalo', 'dong', 'tolong', 'coba', 'minta', 'info', 'hexindoparts', 'com', 'web', 'website', 'the', 'for', 'and', 'what', 'how', 'much', 'cost', 'biaya', 'catalog', 'katalog', 'list', 'daftar', 'semua']);
export const MINTA_HARGA_RE = /\b(?:harga\w*|price\w*|berapa|brp|berpa|biaya|cost)\b|hexindo\s*parts?/i;

const PN_SEL_RE = /^(?=[A-Z0-9 .-]*\d)[A-Z0-9][A-Z0-9 .-]{2,21}[A-Z0-9]$/;
const PN_JAWABAN_RE = /`([A-Z0-9][A-Z0-9-]{3,21})`/g;

function jarak(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

const kataCocok = (k: string, w: string): boolean =>
  w === k || (k.length >= 4 && w.startsWith(k)) || (k.length >= 6 && w.length >= 6 && jarak(k, w) <= 2);

// Rows ("item | PN | NAME | …" or "PN | DESC | …") whose name matches the question pick which PNs get a web price;
// with no match, a short follow-up ("harganya berapa") prices the PNs quoted in the previous answer.
export function pilihPnHarga(content: string, teks: string[], jawabanSebelumnya = '', maks = 8): string[] {
  const kunci = [...new Set(teks.join(' ').toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !BUKAN_KATA.has(w) && !/^\d+$/.test(w)))];
  const skor = new Map<string, number>();
  if (kunci.length) {
    for (const line of content.split('\n')) {
      const sel = line.split('|').map(s => s.trim());
      const i = sel.findIndex(s => PN_SEL_RE.test(s));
      if (i < 0 || !sel[i + 1]) continue;
      const kata = sel[i + 1].toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      let n = 0;
      for (const k of kunci) {
        if (kata[0] && kataCocok(k, kata[0])) n += 3;
        else if (kata.some(w => kataCocok(k, w))) n += 1;
      }
      if (n > 0) skor.set(sel[i], Math.max(skor.get(sel[i]) ?? 0, n));
    }
  }
  const dariData = [...skor.entries()].sort((a, b) => b[1] - a[1]).map(([pn]) => pn);
  const dariJawaban = dariData.length ? [] : [...jawabanSebelumnya.matchAll(PN_JAWABAN_RE)].map(m => m[1]).filter(p => /\d/.test(p) && !/^(?:ZX|ZW)\d/.test(p));
  return [...new Set([...dariData, ...dariJawaban])].slice(0, maks);
}
