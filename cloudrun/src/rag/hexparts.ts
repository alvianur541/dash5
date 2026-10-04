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
