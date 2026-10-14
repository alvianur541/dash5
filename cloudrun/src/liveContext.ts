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

const WARNING_RE = /⚠|peringatan|bahaya|hati-hati|caution|warning|danger|jangan/i;
const plain = (s: string) => s.replace(/^#{1,6}\s*/, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

// The full answer is already on screen; the voice model only needs the gist, and every word it is given is billed again on each later turn.
export function ringkasUntukSuara(text: string, max = 2400): string {
  const out: string[] = [];
  let header: string[] | null = null, shown = 0, hidden = 0;
  const closeTable = () => { if (header && hidden) out.push(`(+${hidden} baris lain di layar)`); header = null; shown = 0; hidden = 0; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\|?\s*:?-{2,}/.test(line)) continue;
    if (line.startsWith('|')) {
      const cells = line.split('|').map(plain).filter(Boolean);
      if (!header) { header = cells; out.push(`Kolom: ${cells.join(' — ')}`); continue; }
      if (shown < 8) { out.push(cells.join(' — ')); shown++; } else hidden++;
      continue;
    }
    closeTable();
    const s = plain(line);
    if (s && !/^[-=*_]{3,}$/.test(s)) out.push(s);
  }
  closeTable();
  const full = out.join('\n');
  if (full.length <= max) return full;
  const tail = '(rincian lengkap ada di layar)';
  const warnings = out.filter(l => WARNING_RE.test(l)).join('\n').slice(0, Math.floor(max / 3));
  let head = '';
  for (const l of out) {
    if (head.length + l.length + 1 > max - warnings.length - tail.length - 2) break;
    head += (head ? '\n' : '') + l;
  }
  const missing = warnings.split('\n').filter(w => w && !head.includes(w)).join('\n');
  return [head, missing, tail].filter(Boolean).join('\n');
}
