// Time-aware + context-aware greetings untuk welcome screen.
// Context-aware welcome message.

export interface GreetingContext {
  name: string;
  date?: Date;
}

/**
 * Sapaan bergaya obrolan, bukan formal kantoran — teknisi buka app ini sambil
 * berdiri di samping unit, bukan di meja rapat.
 *
 * Tiap slot punya beberapa varian, dipilih berdasarkan TANGGAL. Jadi sapaan
 * berganti tiap hari tapi tetap sama sepanjang hari itu. Math.random() sengaja
 * TIDAK dipakai: getGreeting() dipanggil saat render, jadi acak murni bikin
 * teksnya loncat-loncat tiap re-render.
 *
 * Jaga tetap pendek (±22-26 karakter + emoji) supaya muat 1 baris di hero
 * desktop (font 30px). Kalimat panjang akan turun baris dan merusak hero.
 */
const GREETINGS = {
  monday:  ['Senin, gaskeun', 'Balik ngegas', 'Senin lagi euy'],
  friday:  ['Dikit lagi weekend', 'Tinggal separuh jalan', 'Bentar lagi bebas'],
  weekend: ['Waduh lembur nih', 'Weekend tetap gas', 'Libur kok manggil'],
  // Hindari koma di dalam frasa (kecuali yang memang enak dibaca) — nama sudah
  // didahului koma di template, jadi "Pagi, gercep, Alvianur" jadi dobel koma.
  pagi:    ['Pagi, sat set ya', 'Cus pagi ini', 'Pagi udah gercep'],
  siang:   ['Siang masih kuat', 'Siang gas terus', 'Siang santuy dulu'],
  sore:    ['Sore, dikit lagi', 'Sore hampir kelar', 'Sore sisa tenaga'],
  malam:   ['Masih gaskeun', 'Lembur ya', 'Malam masih kuat'],
} as const;

const EMOJI = {
  monday: '💪', friday: '🎯', weekend: '🛠️',
  pagi: '🌅', siang: '☀️', sore: '🌇', malam: '🌙',
} as const;

type Slot = keyof typeof GREETINGS;

export function getGreeting({ name, date = new Date() }: GreetingContext): string {
  const hour = date.getHours();
  const day  = date.getDay();   // 0=Min, 1=Sen, …, 6=Sab

  let slot: Slot;
  if (day === 1 && hour >= 5 && hour < 11)                    slot = 'monday';
  else if (day === 5 && hour >= 15 && hour < 18)              slot = 'friday';
  else if ((day === 0 || day === 6) && hour >= 5 && hour < 18) slot = 'weekend';
  else if (hour >= 5  && hour < 11)                           slot = 'pagi';
  else if (hour >= 11 && hour < 15)                           slot = 'siang';
  else if (hour >= 15 && hour < 18)                           slot = 'sore';
  else                                                        slot = 'malam';

  const variants = GREETINGS[slot];
  const text = variants[date.getDate() % variants.length];
  return `${text}, ${name} ${EMOJI[slot]}`;
}
