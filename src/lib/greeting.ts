
interface GreetingContext {
  name: string;
  date?: Date;
}

const GREETINGS = {
  monday:  ['Selamat datang kembali', 'Siap membantu awal minggu ini', 'Asisten teknis siap digunakan'],
  friday:  ['Selamat sore', 'Siap membantu menutup pekan ini', 'Asisten teknis siap digunakan'],
  weekend: ['Selamat datang', 'Siap membantu kapan pun dibutuhkan', 'Asisten teknis siap digunakan'],
  pagi:    ['Selamat pagi', 'Selamat pagi, siap membantu', 'Asisten teknis siap digunakan'],
  siang:   ['Selamat siang', 'Selamat siang, siap membantu', 'Asisten teknis siap digunakan'],
  sore:    ['Selamat sore', 'Selamat sore, siap membantu', 'Asisten teknis siap digunakan'],
  malam:   ['Selamat malam', 'Selamat malam, siap membantu', 'Asisten teknis siap digunakan'],
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
