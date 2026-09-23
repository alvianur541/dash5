const SCALE = 2;
const CARD_MAX_W = 1180;
const PAD = 30;
const CELL_PAD_X = 14;
const CELL_PAD_Y = 9;
const LINE_H = 21;
const MIN_COL_W = 96;

const INK = '#1A1915';
const BODY_INK = '#33312C';
const MUTED = '#6F6C63';
const LINE = '#E3DFD6';
const HEAD_BG = '#F3F0E9';
const ACCENT = '#D97757';
const PAPER = '#FFFFFF';

const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace';

const CODE_RE = /^[A-Z0-9][A-Z0-9./-]{4,}$/i;
const NUM_RE = /^(?:rp\.?\s*)?[\d.,%\s-]*\d[\d.,%\s-]*$/i;

type TableImageOptions = { unit: string; notes?: string[] };

type Grid = { head: string[]; rows: string[][] };

function readTable(table: HTMLTableElement): Grid {
  const cellText = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const all = Array.from(table.rows).map(r => Array.from(r.cells).map(cellText));
  const rows = all.filter(r => r.some(c => c !== ''));
  if (!rows.length) return { head: [], rows: [] };
  const fromThead = table.tHead ? Array.from(table.tHead.rows[0]?.cells ?? []).map(cellText) : [];
  const head = fromThead.length ? fromThead : rows[0];
  const body = fromThead.length ? rows.slice(table.tHead ? table.tHead.rows.length : 0) : rows.slice(1);
  const width = Math.max(head.length, ...body.map(r => r.length), 1);
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return { head: pad(head), rows: body.map(pad) };
}

const isNumeric = (s: string) => NUM_RE.test(s) && /\d/.test(s);
const ID_HEAD_RE = /\b(part|pn|no\.?|nomor|kode|item|code)\b/i;

function rightAligned(g: Grid): boolean[] {
  return g.head.map((head, i) => {
    if (ID_HEAD_RE.test(head)) return false;
    const cells = g.rows.map(r => r[i] ?? '').filter(Boolean);
    return cells.length > 0 && cells.every(isNumeric);
  });
}
const isCode = (s: string) => CODE_RE.test(s) && /\d/.test(s);

const font = (weight: number, size: number, mono = false) =>
  weight + ' ' + size + 'px ' + (mono ? MONO : SANS);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (!text) return [''];
  if (ctx.measureText(text).width <= maxW) return [text];
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width <= maxW) { line = next; continue; }
    if (line) out.push(line);
    if (ctx.measureText(word).width <= maxW) { line = word; continue; }
    let part = '';
    for (const ch of word) {
      if (part && ctx.measureText(part + ch).width > maxW) { out.push(part); part = ch; } else part += ch;
    }
    line = part;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function columnWidths(ctx: CanvasRenderingContext2D, g: Grid, avail: number): number[] {
  const cols = g.head.map((h, i) => {
    ctx.font = font(600, 14);
    let w = ctx.measureText(h).width;
    for (const row of g.rows) {
      const cell = row[i] ?? '';
      ctx.font = font(400, 14, isCode(cell));
      w = Math.max(w, ctx.measureText(cell).width);
    }
    return Math.ceil(w) + CELL_PAD_X * 2;
  });
  let total = cols.reduce((a, b) => a + b, 0);
  for (let guard = 0; total > avail && guard < 4000; guard++) {
    let widest = 0;
    for (let i = 1; i < cols.length; i++) if (cols[i] > cols[widest]) widest = i;
    if (cols[widest] <= MIN_COL_W) break;
    cols[widest] -= 8;
    total -= 8;
  }
  return cols;
}

export async function renderTablePng(table: HTMLTableElement, opts: TableImageOptions): Promise<Blob> {
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* fall back to system fonts */ } }

  const grid = readTable(table);
  if (!grid.head.length || !grid.rows.length) throw new Error('Tabel kosong');

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('Canvas tidak didukung');

  const cols = columnWidths(probe, grid, CARD_MAX_W - PAD * 2);
  const right = rightAligned(grid);
  const tableW = cols.reduce((a, b) => a + b, 0);
  const cardW = tableW + PAD * 2;

  const lineCache: string[][][] = [];
  const rowH: number[] = [];
  const measureRow = (row: string[], weight: number) => {
    const lines = row.map((cell, i) => {
      probe.font = font(weight, 14, isCode(cell));
      return wrap(probe, cell, cols[i] - CELL_PAD_X * 2);
    });
    lineCache.push(lines);
    rowH.push(Math.max(...lines.map(l => l.length)) * LINE_H + CELL_PAD_Y * 2);
  };
  measureRow(grid.head, 600);
  grid.rows.forEach(r => measureRow(r, 400));

  probe.font = font(400, 13);
  const noteLines = (opts.notes ?? []).filter(Boolean).flatMap(n => wrap(probe, n, tableW));

  const headerH = 92;
  const tableH = rowH.reduce((a, b) => a + b, 0);
  const footerH = noteLines.length ? 14 + noteLines.length * 19 : 0;
  const cardH = headerH + tableH + footerH + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cardW * SCALE);
  canvas.height = Math.round(cardH * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, cardW, cardH);

  const stamp = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  ctx.fillStyle = INK;
  ctx.font = font(700, 21);
  ctx.fillText(opts.unit, PAD, PAD);
  ctx.fillStyle = MUTED;
  ctx.font = font(400, 13);
  ctx.fillText(stamp, cardW - PAD - ctx.measureText(stamp).width, PAD + 6);
  ctx.font = font(500, 11.5);
  ctx.fillText('HEXINDO TECHNICAL ASSISTANT', PAD, PAD + 30);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, headerH - 14, tableW, 2);

  let y = headerH;
  const drawRow = (lines: string[][], h: number, isHead: boolean, cells: string[]) => {
    if (isHead) { ctx.fillStyle = HEAD_BG; ctx.fillRect(PAD, y, tableW, h); }
    let x = PAD;
    lines.forEach((cellLines, i) => {
      const raw = cells[i] ?? '';
      const mono = !isHead && isCode(raw);
      ctx.fillStyle = isHead ? INK : BODY_INK;
      ctx.font = font(isHead ? 600 : 400, 14, mono);
      const alignRight = !isHead && right[i];
      cellLines.forEach((text, li) => {
        const ty = y + CELL_PAD_Y + li * LINE_H;
        const tx = alignRight ? x + cols[i] - CELL_PAD_X - ctx.measureText(text).width : x + CELL_PAD_X;
        ctx.fillText(text, tx, ty);
      });
      x += cols[i];
    });
    ctx.fillStyle = LINE;
    ctx.fillRect(PAD, y + h - 1, tableW, 1);
    y += h;
  };
  drawRow(lineCache[0], rowH[0], true, grid.head);
  grid.rows.forEach((row, i) => drawRow(lineCache[i + 1], rowH[i + 1], false, row));

  if (noteLines.length) {
    y += 13;
    ctx.fillStyle = MUTED;
    ctx.font = font(400, 13);
    noteLines.forEach((line, i) => ctx.fillText(line, PAD, y + i * 19));
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), 'image/png');
  });
}

export function tableImageName(unit: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return 'tabel-' + unit.replace(/\s+/g, '') + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + '.png';
}

// iOS puts <a download> into Files, never Photos — a long-press preview is the usable path there.
export function isIosLike(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// iOS blocks <a download> into Photos; the share sheet is the only route that reaches it.
export async function shareImage(blob: Blob, filename: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return 'unsupported';
  let file: File;
  try {
    file = new File([blob], filename, { type: 'image/png' });
  } catch {
    return 'unsupported';
  }
  if (!navigator.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    const name = (err as Error)?.name;
    return name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
