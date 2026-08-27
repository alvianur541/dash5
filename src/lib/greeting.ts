
export interface GreetingContext {
  name: string;
  date?: Date;
}

const GREETINGS = {
  monday:  ['Senin, gaskeun', 'Balik ngegas', 'Senin lagi euy'],
  friday:  ['Dikit lagi weekend', 'Tinggal separuh jalan', 'Bentar lagi bebas'],
  weekend: ['Waduh lembur nih', 'Weekend tetap gas', 'Libur kok manggil'],
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
  return `${text}, ${name} ${EMOJI[slot]}`;
}
