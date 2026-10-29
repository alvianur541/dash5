export const PROMO_KATEGORI = 'PROMO Q3 FY2026';
export const PROMO_BERAKHIR = '2026-12-31';

export const PROMO_KATEGORI_LAMA: readonly string[] = ['PROMO Q2 FY2026'];

const tanggalJakarta = (now: Date): string =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export const promoAktif = (now?: Date): boolean => {
  const uji = process.env.PROMO_UJI;
  if (!now && (uji === 'on' || uji === 'off')) return uji === 'on';
  return tanggalJakarta(now ?? new Date()) <= PROMO_BERAKHIR;
};

const SEL_HARGA_RE = /\|\s*(?:(?:Normal|Promo|Disc):\s*)?(?:Rp\s?[\d.]+|\d{1,3}\s*%)\s*(?=\||$)/g;
const BLOK_WEB = '[HARGA HEXINDOPARTS.COM';

export function tanpaHargaDb(text: string): string {
  let diBlokWeb = false;
  return text.split('\n').flatMap(line => {
    if (line.startsWith(BLOK_WEB)) diBlokWeb = true;
    else if (!line.trim()) diBlokWeb = false;
    if (diBlokWeb) return [line];
    if (/^\s*(Periode Promo|Document:\s*PROMO|Syarat\s*:|Ketentuan\s*:|Pemesanan harus diinvoice)/i.test(line)) return [];
    if (/Harga Normal\s*\|\s*Disc\s*\|\s*Harga Promo/i.test(line)) return [line.replace(/\s*\|\s*Harga Normal\s*\|\s*Disc\s*\|\s*Harga Promo(?:\s*\[Keterangan unit\])?\s*$/i, '')];
    if (/Rp\s?[\d.]+/.test(line) && line.includes('|')) {
      const tag = line.match(/\s*(\[[^\]]{2,40}\])\s*$/)?.[1];
      const tanpaTag = tag ? line.replace(/\s*\[[^\]]{2,40}\]\s*$/, '') : line;
      const bersih = tanpaTag.replace(SEL_HARGA_RE, '').replace(/\s+$/, '').replace(/\s*\|\s*Rp\s?[\d.]+\s*/g, ' ');
      return [tag && !/new item/i.test(tag) ? `${bersih}  ${tag}` : bersih];
    }
    return [line
      .replace(/\bPROMO Q\d FY\d{4}\b/g, 'DAFTAR PARTS')
      .replace(/--- HARGA PROMO \(khusus PN di atas\) ---/g, '--- PARTS TERDAFTAR (khusus PN di atas) ---')
      .replace(/PARTS CATALOG & PROMO/g, 'PARTS CATALOG')];
  }).join('\n');
}

export function bersihkanPromoLama<T extends { content: string; metadata?: any }>(rows: T[]): T[] {
  return rows.map(r => PROMO_KATEGORI_LAMA.includes(r.metadata?.Kategori) ? { ...r, content: tanpaHargaDb(r.content) } : r);
}

const angkaRp = (s: string): string => s.replace(/\D/g, '');

export function hargaPromo(data: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let diPromo = false;
  for (const line of data.split('\n')) {
    if (/^Section:|^---/.test(line.trim())) diPromo = /^Section:\s*PROMO Q\d FY\d{4}\b|^--- HARGA PROMO/i.test(line.trim());
    const bentukPromo = /\|\s*\d{1,2}\s*%\s*\|/.test(line) && (line.match(/Rp\s?[\d.]+/g) ?? []).length >= 2;
    if (!(diPromo || bentukPromo) || !line.includes('|')) continue;
    const pn = line.split('|')[0].replace(/[*`]/g, '').trim().toUpperCase();
    const harga = [...line.matchAll(/Rp\s?([\d.]+)/g)].map(m => angkaRp(m[1]));
    if (!pn || !harga.length) continue;
    const set = out.get(pn) ?? new Set<string>();
    harga.forEach(h => set.add(h));
    out.set(pn, set);
  }
  return out;
}
