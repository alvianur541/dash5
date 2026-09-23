import { deps } from './deps';
import { VRequest, clampThinking, addUsage, MODEL, MODEL_CHAIN } from './vertex';

function collapseDegenerateLoops(text: string): string {
  let out = text;
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/([^\n]{8,160}?[.!?…]\s*)(?:\1){3,}/g, '$1')
      .replace(/(^[^\n]{4,160}\n)(?:\1){3,}/gm, '$1');
  }
  return out;
}

const tunggu = (ms: number) => new Promise(r => setTimeout(r, ms));

const TAIL_LOOP_RE = /([^\n]{8,120}?[.!?…]\s*)(?:\1){5,}$/;

export const STREAM_CUT_NOTE =
  '\n\n> ⚠️ Jawaban terputus di tengah — koneksi ke AI sempat putus. Kirim ulang pertanyaanmu untuk jawaban lengkap.';
export const STREAM_HALT_NOTE =
  '\n\n> ⚠️ Jawaban terhenti sebelum selesai. Kirim ulang pertanyaanmu, atau ubah sedikit kalimatnya.';
export const STREAM_LONG_NOTE =
  '\n\n> ⚠️ Daftarnya terlalu panjang dan terpotong di sini. Ketik "lanjutkan", atau sebut section/komponen yang dicari supaya daftarnya lebih pendek.';

interface UsageMeta {
  promptTokenCount?: number; candidatesTokenCount?: number;
  thoughtsTokenCount?: number; cachedContentTokenCount?: number;
}

function catatSebab(sebab: string): void {
  // First cause only — that is what made the primary model fail.
  try { const m = deps().meta; if (!m.fallbackSebab) m.fallbackSebab = sebab; } catch { /* di luar konteks */ }
}

function pastDeadline(): boolean {
  const at = deps().deadlineAt;
  return typeof at === 'number' && Date.now() > at - 5_000;
}

export function looksComplete(text: string): boolean {
  const t = text.trim();
  return t.length >= 300 || /[.!?…:)\]`|*_]$/.test(t);
}

export async function callProxyStream(
  body: VRequest,
  onChunk: (text: string) => void,
  enableGoogleSearch = false,
): Promise<string> {
  const STREAM_TIMEOUT_MS = 90_000;
  // 45 s, not 25 — two stall retries burn 20 s, leaving the third connection no time to finish.
  const FIRST_TOKEN_TIMEOUT_MS = 45_000;

  const MAX_ATTEMPT = Math.max(3, MODEL_CHAIN.length);
  let attempt = 0;
  let fullText = '';
  let modelUsed = MODEL;
  let usage: UsageMeta | null = null;
  const modelAt = (n: number) => MODEL_CHAIN[Math.min(n - 1, MODEL_CHAIN.length - 1)];

  while (true) {
    attempt++;
    fullText = '';
    usage = null;
    modelUsed = modelAt(attempt);
    if (attempt > 1) {
      console.warn('[fallback] percobaan %d → model %s', attempt, modelUsed);
      try { deps().meta.fallbackTo = modelUsed; } catch { /* di luar konteks */ }
    }
    let upstreamError: string | null = null;
    let quotaFull = false;
    let hardCut = false;
    let finishReason: string | null = null;

    const ctrl = new AbortController();
    const hardTimer = setTimeout(() => { hardCut = true; ctrl.abort(); }, STREAM_TIMEOUT_MS);

    let firstTokenSeen = false;
    let streamHidup    = false;
    const watchdog = setTimeout(() => {
      if (!streamHidup) {
        console.warn('[stream] %d dtk tanpa satu chunk pun — batalkan & ulang', FIRST_TOKEN_TIMEOUT_MS / 1000);
        ctrl.abort();
      }
    }, FIRST_TOKEN_TIMEOUT_MS);

    try {
      await deps().stream(clampThinking(body, modelUsed), modelUsed, c => {
        if (c.error) {
          if (c.code === 429) { quotaFull = true; ctrl.abort(); return; }
          upstreamError = String(c.error);
          ctrl.abort();
          return;
        }
        if (c.live && !streamHidup) { streamHidup = true; clearTimeout(watchdog); }
        if (c.usageMetadata) usage = c.usageMetadata;
        if (c.finishReason) finishReason = c.finishReason;
        if (c.text) {
          firstTokenSeen = true;
          fullText += c.text; onChunk(c.text);
          if (fullText.length > 400 && TAIL_LOOP_RE.test(fullText.slice(-800))) {
            console.warn('[stream] degenerate loop terdeteksi — stream dihentikan dini');
            ctrl.abort();
          }
        }
      }, { enableGoogleSearch, signal: ctrl.signal });
    } catch (err) {
      if (!ctrl.signal.aborted) upstreamError = (err as Error)?.message ?? 'Stream gagal';
    } finally {
      clearTimeout(watchdog);
      clearTimeout(hardTimer);
    }

    if (quotaFull) {
      if (attempt < MAX_ATTEMPT && !pastDeadline()) {
        console.warn('[fallback] %s 429 (kapasitas penuh) — pindah model', modelUsed);
        catatSebab('429');
        continue;
      }
      throw new Error('KUOTA_PENUH');
    }

    if (hardCut && fullText.trim()) {
      console.warn('[stream] batas %d dtk tercapai setelah %d huruf — jawaban dipotong', STREAM_TIMEOUT_MS / 1000, fullText.trim().length);
      fullText += STREAM_CUT_NOTE;
      onChunk(STREAM_CUT_NOTE);
      break;
    }

    if (upstreamError) {
      if (fullText.trim()) {
        console.warn('[stream] upstream error setelah sebagian teks:', upstreamError);
        fullText += STREAM_CUT_NOTE;
        onChunk(STREAM_CUT_NOTE);
        break;
      }
      if (attempt < MAX_ATTEMPT && !pastDeadline()) {
        console.warn('[stream] upstream gagal (%s) — percobaan %d/%d, pindah model', upstreamError, attempt, MAX_ATTEMPT);
        catatSebab('error');
        await tunggu(300);
        continue;
      }
      throw new Error(`Stream terputus: ${upstreamError}`);
    }

    const canRetry = attempt < MAX_ATTEMPT && !pastDeadline();
    if (!firstTokenSeen && !fullText.trim() && canRetry) {
      console.warn('[stream] tak ada token sama sekali — percobaan %d/%d, pindah model', attempt, MAX_ATTEMPT);
      catatSebab('hang');
      await tunggu(300);
      continue;
    }
    if (!usage && !looksComplete(fullText) && canRetry) {
      console.warn('[stream] jawaban sepotong (%d huruf, tanpa stempel usage) — percobaan %d/%d, ulangi', fullText.trim().length, attempt, MAX_ATTEMPT);
      catatSebab('sepotong');
      if (fullText) onChunk('\n\n');
      await tunggu(attempt * 900);
      continue;
    }
    if (finishReason === 'MAX_TOKENS') {
      // Same cap would truncate again; retrying only burns quota and drops to the fallback model.
      console.warn('[stream] finishReason=MAX_TOKENS setelah %d huruf — batas panjang, tidak diulang', fullText.trim().length);
      fullText += STREAM_LONG_NOTE;
      onChunk(STREAM_LONG_NOTE);
    } else if (finishReason && finishReason !== 'STOP') {
      if (canRetry) {
        console.warn('[stream] finishReason=%s setelah %d huruf — percobaan %d/%d, ulangi', finishReason, fullText.trim().length, attempt, MAX_ATTEMPT);
        catatSebab('finish');
        if (fullText) onChunk('\n\n');
        await tunggu(attempt * 900);
        continue;
      }
      console.warn('[stream] finishReason=%s tetap setelah %d percobaan — beri catatan', finishReason, attempt);
      fullText += STREAM_HALT_NOTE;
      onChunk(STREAM_HALT_NOTE);
    }
    break;
  }

  const u = usage as UsageMeta | null;
  addUsage(u?.promptTokenCount, u?.candidatesTokenCount, u?.thoughtsTokenCount, u?.cachedContentTokenCount);
  const inp = u?.promptTokenCount ?? 0;
  const cache = u?.cachedContentTokenCount ?? 0;
  deps().meta.modelUsed = modelUsed;
  console.info('[tokens] model=%s think=%s%s in=%d (prompt-cache %d%%) out=%d thinking=%d',
    modelUsed, clampThinking(body, modelUsed).generationConfig?.thinkingConfig?.thinkingLevel,
    deps().thinkOverride ? ' (override, cache jawaban dilewati)' : '',
    inp, inp ? Math.round((cache / inp) * 100) : 0,
    u?.candidatesTokenCount ?? 0, u?.thoughtsTokenCount ?? 0);
  return collapseDegenerateLoops(fullText);
}
