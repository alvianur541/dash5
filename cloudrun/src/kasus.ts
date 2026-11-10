import type { Message } from './types';

const UKUR_RE = /\d+(?:[.,]\d+)?\s*(?:mpa|kpa|bar|psi|kgf\/cm2|volt|mv|v|ohm|kohm|Ω|ampere|amper|ma|rpm|min-1|°c|derajat|l\/min|lpm|mm|detik|menit)\b/i;
const TINDAKAN_RE = /\b(?:sudah|udah|sdh|telah|habis)\s+(?:di\s?)?(?:ganti|tukar|cek|periksa|bersih|ukur|lepas|bongkar|setel|adjust|kuras|reset|coba|tes|test)\w*/i;
const HASIL_RE = /\b(?:normal|aman|bagus|baik|bersih|penuh|putus|short|bocor|rembes|macet|longgar|kendor|aus|rusak|mati|nyambung|tidak\s+nyambung|tetap|masih|hilang|muncul|tidak\s+berubah|ngga\s+berubah|gak\s+berubah)\b/i;
const KODE_RE = /\b(?:[A-Z]{1,4}\s?:?\s?)?\d{4,6}-\d{1,2}\b/;
const TANYA_RE = /\?|^\s*(?:berapa|brp|apa|apakah|kenapa|knp|mengapa|bagaimana|gimana|cara|dimana|di\s*mana|letak|fungsi|harga|hrg|cek\s+harga|part\s*number|pn)\b/i;
const KELUHAN_RE = /\b(?:ngga?k?|nggak|gak|ga|tidak|tdk|tak)\s+(?:bisa|mau|jalan|nyala|hidup|kuat|fungsi|berfungsi)|\b(?:mati|mogok|macet|lambat|lemot|lemah|loyo|ngedrop|drop|bocor|rembes|overheat|panas|bunyi|kasar|getar|asap|error|alarm|warning|trouble|mistrack|drift|stuck|hunting)\b/i;

const MAKS_FAKTA = 8;
const MAKS_HURUF = 170;

const rapikan = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, MAKS_HURUF);

const potong = (teks: string): string[] =>
  teks.split(/(?<=[.!?;])\s+|\n+/).map(rapikan).filter(k => k.split(' ').length >= 2);

const faktaDari = (kalimat: string): boolean =>
  UKUR_RE.test(kalimat) || TINDAKAN_RE.test(kalimat) || KODE_RE.test(kalimat)
  || (HASIL_RE.test(kalimat) && !TANYA_RE.test(kalimat) && !/\b(?:harga|hrg|promo|pn|part\s*number)\b/i.test(kalimat));

export const adalahLaporan = (teks: string): boolean => potong(teks).some(faktaDari);

export interface CatatanKasus { keluhan: string; fakta: string[] }

export function catatKasus(history: Message[], sekarang: string): CatatanKasus {
  const lalu = history.filter(m => m.role === 'user' && m.content?.trim()).slice(-12).map(m => m.content);
  const keluhan = rapikan(lalu.find(u => KELUHAN_RE.test(u) && !UKUR_RE.test(u) && !TANYA_RE.test(u)) ?? '');
  const kini = rapikan(sekarang).toLowerCase();
  const seen = new Set<string>();
  const fakta = lalu.flatMap(potong)
    .filter(k => faktaDari(k) && k !== keluhan && k.toLowerCase() !== kini)
    .filter(k => !seen.has(k.toLowerCase()) && !!seen.add(k.toLowerCase()))
    .slice(-MAKS_FAKTA);
  return { keluhan, fakta };
}

export function blokKasus(history: Message[], sekarang: string): string {
  const { keluhan, fakta } = catatKasus(history, sekarang);
  if (!fakta.length) return '';
  return `\n\n[CATATAN KASUS — rangkuman ucapan teknisi di sesi ini; ini klaim teknisi, BUKAN data manual]\n`
    + (keluhan ? `Keluhan awal: ${keluhan}\n` : '')
    + `Sudah dilaporkan teknisi (urut waktu):\n${fakta.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    + 'Pakai catatan ini untuk memegang kasusnya: jangan menyuruh ulang yang sudah dilaporkan, sebut penyebab yang sudah gugur, hubungkan hasil-hasil itu satu sama lain, dan lanjut dari titik terakhir.';
}
