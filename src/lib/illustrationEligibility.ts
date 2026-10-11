import type { Message } from '../types';

const DRAW_REQUEST = /\b(?:(?:buat(?:kan)?|bikin(?:kan)?)\s+(?:sebuah\s+)?(?:gambar|diagram|ilustrasi|skema)|gambarkan|ilustrasikan|draw\b|(?:create|generate|make)\s+(?:an?\s+)?(?:image|diagram|illustration|drawing))\b/i;
const ARROW = /(?:[-=]{1,3}>|<[-=]{1,3}|[→←↔↓↑])/;

export function hasDiagram(content: string): boolean {
  const lines = content.split('\n').map(line => line.trim());
  for (const line of lines) {
    if (!ARROW.test(line) || line.startsWith('|')) continue;
    const nodes = line.split(/(?:[-=]{1,3}>|<[-=]{1,3}|[→←↔↓↑])/);
    if (nodes.length >= 2 && nodes.every(node => node.trim().length > 0 && node.trim().length <= 60 && node.trim().split(/\s+/).length <= 6)
      && nodes.every(node => /[a-z]/i.test(node))) return true;
  }
  if (lines.filter(line => /^\[[^\]\n]+\]$/.test(line)).length >= 2
    && lines.some(line => /^[|│]+$/.test(line))
    && lines.some(line => /^[vV↓↑^]$/.test(line))) return true;
  // Box/tree connectors need both labelled nodes and connected linework, not a Markdown table.
  return lines.some(line => /[┌┐└┘├┤┬┴┼╔╗╚╝]/.test(line))
    && lines.some(line => /[─━═│┃║]{2,}|[├└][─━]/.test(line))
    && lines.some(line => /[a-z]/i.test(line) && /[│┃║├└]/.test(line));
}

export function shouldOfferIllustration(messages: Message[], index: number): boolean {
  const answer = messages[index];
  if (!answer || answer.role !== 'assistant') return false;
  if (hasDiagram(answer.content)) return true;
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return DRAW_REQUEST.test(messages[i].content);
  }
  return false;
}
