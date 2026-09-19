
interface GreetingContext {
  name: string;
  date?: Date;
}

export function getGreeting({ name }: GreetingContext): string {
  return `Halo ${name}, mau cek apa?`;
}
