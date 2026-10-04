// The DB keeps one promo period; when a new period is ingested, update both constants.
export const PROMO_KATEGORI = 'PROMO Q2 FY2026';
export const PROMO_BERAKHIR = '2026-09-30';

const tanggalJakarta = (now: Date): string =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export const promoAktif = (now: Date = new Date()): boolean => tanggalJakarta(now) <= PROMO_BERAKHIR;

const SEL_HARGA_RE = /\|\s*(?:(?:Normal|Promo|Disc):\s*)?(?:Rp\s?[\d.]+|\d{1,3}\s*%)\s*(?=\||$)/g;
const BLOK_WEB = '[HARGA HEXINDOPARTS.COM';

// Outside a promo period every price comes from hexindoparts.com: price-list chunks keep PN + description only.
export function tanpaHargaDb(text: string): string {
  let diBlokWeb = false;
  return text.split('\n').flatMap(line => {
    if (line.startsWith(BLOK_WEB)) diBlokWeb = true;
    else if (!line.trim()) diBlokWeb = false;
    if (diBlokWeb) return [line];
    if (/^\s*(Periode Promo|Document:\s*PROMO|Syarat\s*:)/i.test(line)) return [];
    if (/Harga Normal\s*\|\s*Disc\s*\|\s*Harga Promo/i.test(line)) return [line.replace(/\s*\|\s*Harga Normal\s*\|\s*Disc\s*\|\s*Harga Promo\s*$/i, '')];
    if (/Rp\s?[\d.]+/.test(line) && line.includes('|')) return [line.replace(SEL_HARGA_RE, '').replace(/\s+$/, '')];
    return [line
      .replace(/\bPROMO Q\d FY\d{4}\b/g, 'DAFTAR PARTS')
      .replace(/--- HARGA PROMO \(khusus PN di atas\) ---/g, '--- PARTS TERDAFTAR (khusus PN di atas) ---')
      .replace(/PARTS CATALOG & PROMO/g, 'PARTS CATALOG')];
  }).join('\n');
}
