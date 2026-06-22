// Time-aware + context-aware greetings untuk welcome screen.
// Context-aware welcome message.

export interface GreetingContext {
  name: string;
  date?: Date;
}

/**
 * Greeting time-aware + day-of-week aware.
 * Variants pendek (~22-26 chars + emoji) supaya fit 1 baris di desktop hero (30px font).
 * Priority: special day → standard time-of-day.
 */
export function getGreeting({ name, date = new Date() }: GreetingContext): string {
  const hour = date.getHours();
  const day  = date.getDay(); // 0=Sun, 1=Mon, …, 6=Sat

  // ── Special day overrides (shortened) ──
  if (day === 1 && hour >= 5 && hour < 11) {
    return `Semangat Senin, ${name} 💪`;            // was: "Semangat awal minggu..."
  }
  if (day === 5 && hour >= 15 && hour < 18) {
    return `Mau cepat selesai, ${name} 🎯`;         // was: "Mau selesaikan sebelum weekend..."
  }
  if ((day === 0 || day === 6) && hour >= 5 && hour < 18) {
    return `Weekend on-call, ${name} 🛠️`;          // was: "Lagi on-call hari ini..."
  }

  // ── Standard time-of-day greeting ──
  if (hour >= 5  && hour < 11) return `Selamat pagi, ${name} 🌅`;
  if (hour >= 11 && hour < 15) return `Selamat siang, ${name} ☀️`;
  if (hour >= 15 && hour < 18) return `Selamat sore, ${name} 🌇`;
  return `Malam, ${name} 🌙`;                       // was: "Masih kerja malam ini, [name]? 🌙"
}
