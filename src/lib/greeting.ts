
interface GreetingContext {
  name: string;
  date?: Date;
}

const GREETINGS = {
  monday:  ['Awal minggu, semangat baru', 'Selamat memulai minggu', 'Senin penuh energi'],
  friday:  ['Jumat, tuntaskan dengan baik', 'Akhiri minggu dengan kuat', 'Jumat tetap fokus'],
  weekend: ['Akhir pekan tetap siaga', 'Siap mendampingi hari ini', 'Siap kapan pun dibutuhkan'],
  pagi:    ['Selamat pagi, siap membantu', 'Pagi yang produktif', 'Pagi, mari kita mulai'],
  siang:   ['Selamat siang, tetap fokus', 'Siang tetap produktif', 'Siang, mari lanjutkan'],
  sore:    ['Selamat sore, hampir tuntas', 'Sore, selesaikan dengan baik', 'Sore tetap produktif'],
  malam:   ['Selamat malam, tetap siaga', 'Malam, tetap semangat', 'Siap membantu malam ini'],
} as const;

type Slot = keyof typeof GREETINGS;

export function getGreeting({ name, date = new Date() }: GreetingContext): string {
  const hour = date.getHours();
  const day  = date.getDay();

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
  return `${text}, ${name}`;
}
