
interface GreetingContext {
  name: string;
  date?: Date;
}

export function getGreeting({ name }: GreetingContext): string {
  return `Asistenmu siap membantu, ${name}`;
}
