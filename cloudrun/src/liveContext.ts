export type LiveHistory = { role: 'user' | 'assistant'; content: string }[];

export function boundLiveHistory(input: unknown): LiveHistory {
  if (!Array.isArray(input)) return [];
  const items = input.slice(-30).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-10);
  const out: LiveHistory = [];
  let left = 12000, bytesLeft = 23000;
  const encoder = new TextEncoder();
  const trim = (s: string, cap: number) => s.length <= cap ? s : cap < 8 ? s.slice(0, cap) : s.slice(0, Math.floor((cap - 3) * .65)) + '\n…\n' + s.slice(-Math.ceil((cap - 3) * .35));
  for (let i = items.length - 1; i >= 0 && left > 0; i--) {
    const m = items[i];
    const text = (m.content.slice(0, 64000).replace(/data:[^\s)]+|https?:\/\/[^\s)]+|[A-Za-z0-9+/=]{256,}/gi, '[media omitted]') + (m.role === 'user' && (m.image || m.imageUrl || (Array.isArray(m.attachments) && m.attachments.length)) ? '\n[Foto dikirim; Live hanya menerima teks analisis sebelumnya, bukan foto.]' : '')).trim();
    if (!text) continue;
    let cap = Math.min(8000, left);
    let content = trim(text, cap);
    while (encoder.encode(JSON.stringify(content)).length > bytesLeft && cap > 0) { cap = Math.floor(cap * .8); content = trim(text, cap); }
    if (!content) break;
    bytesLeft -= encoder.encode(JSON.stringify(content)).length;
    left -= content.length;
    out.unshift({ role: m.role, content });
  }
  return out;
}
