// Smart checklist generator — extract langkah prosedural dari markdown AI response.
// Pattern: numbered list (1./2./**1.**) atau bullet dengan kata kerja imperatif Indonesia.

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

const MIN_ITEMS = 3;

// Pakai matchAll (stateless) — `lastIndex` tidak bocor antar pemanggilan.
const NUMBERED_RE = /^\s*(?:\*{2})?\d+[.)]\s*(?:\*{2})?\s*(.+)/gm;
const IMPERATIVE_RE = /^\s*[-*]\s*(Cek|Buka|Pasang|Ukur|Putar|Sambung|Lepas|Bersihkan|Periksa|Ganti|Isi|Kuras|Tutup|Nyalakan|Matikan)\s+.+/gim;

function cleanText(raw: string): string {
  return raw
    // Strip inline markdown formatting (bold/italic/code) — bocor ke UI kalau dibiarkan
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold**  → bold
    .replace(/__([^_]+)__/g,     '$1')   // __bold__  → bold
    .replace(/\*([^*\s][^*]*)\*/g, '$1') // *italic*  → italic (skip stray *)
    .replace(/_([^_\s][^_]*)_/g,   '$1') // _italic_  → italic
    .replace(/`([^`]+)`/g,       '$1')   // `code`    → code (modal pakai font mono semua)
    .replace(/\*+/g, '')                 // sisa ** stray (kalau pasangan tidak balance)
    .replace(/\s+/g, ' ')                // collapse whitespace
    .trim();
}

export function extractChecklistItems(markdownText: string): ChecklistItem[] {
  if (!markdownText) return [];
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();

  // 1. Numbered list (priority — explicit prosedur)
  for (const m of markdownText.matchAll(NUMBERED_RE)) {
    const text = cleanText(m[1]);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push({ id: `n-${items.length}`, text, done: false });
  }

  // 2. Imperative bullet — fallback kalau numbered kurang
  if (items.length < MIN_ITEMS) {
    for (const m of markdownText.matchAll(IMPERATIVE_RE)) {
      const text = cleanText(m[0].replace(/^\s*[-*]\s*/, ''));
      if (!text || seen.has(text)) continue;
      seen.add(text);
      items.push({ id: `b-${items.length}`, text, done: false });
    }
  }

  return items.length >= MIN_ITEMS ? items : [];
}

export function hasProceduralContent(text: string): boolean {
  return extractChecklistItems(text).length >= MIN_ITEMS;
}
