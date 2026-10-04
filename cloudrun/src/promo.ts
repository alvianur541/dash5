// The DB keeps one promo period; when a new period is ingested, update both constants.
export const PROMO_KATEGORI = 'PROMO Q2 FY2026';
export const PROMO_BERAKHIR = '2026-09-30';

const tanggalJakarta = (now: Date): string =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export const promoAktif = (now: Date = new Date()): boolean => tanggalJakarta(now) <= PROMO_BERAKHIR;

const RP = String.raw`Rp\s?[\d.]+`;
const BARIS_HARGA_RE = new RegExp(String.raw`^(.*?\|\s*(?:Normal:\s*)?${RP})\s*\|.*${RP}.*$`);

// After the period ends the same rows serve as a normal price list: discount and promo price are dropped.
export function hargaNormalSaja(text: string): string {
  return text.split('\n').flatMap(line => {
    if (/^\s*(Periode Promo|Document:\s*PROMO)/i.test(line)) return [];
    if (/^\s*Syarat\s*:/i.test(line)) return ['Catatan        : Harga normal, belum termasuk PPN.'];
    if (/Harga Normal\s*\|\s*Disc\s*\|\s*Harga Promo/i.test(line)) return [line.replace(/\s*\|\s*Disc\s*\|\s*Harga Promo\s*$/i, '')];
    const harga = line.match(BARIS_HARGA_RE);
    if (harga) return [harga[1]];
    return [line
      .replace(/\bPROMO Q\d FY\d{4}\b/g, 'DAFTAR HARGA PARTS')
      .replace(/HARGA PROMO/g, 'HARGA NORMAL')
      .replace(/PARTS CATALOG & PROMO/g, 'PARTS CATALOG & HARGA')];
  }).join('\n');
}
