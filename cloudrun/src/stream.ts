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
  const FIRST_TOKEN_TIMEOUT_MS = 8_000;

  const MAX_ATTEMPT = Math.max(3, MODEL_CHAIN.length);
  let attempt = 0;
  let fullText = '';
  let modelUsed = MODEL;
  let noCache = false;
  const modelAt = (n: number) => MODEL_CHAIN[Math.min(n - 1, MODEL_CHAIN.length - 1)];
  const bodyFor = async (m: string): Promise<VRequest> => {
    let b = body;
    if (m !== MODEL && deps().systemFor) {
      const sys = await deps().systemFor!(m);
      const { cachedContent: _c, systemInstruction: _s, ...rest } = body;
      b = { ...rest, ...sys };
    }
    if (noCache && b.cachedContent && deps().systemFor) {
      const { cachedContent: _c, ...rest } = b;
      const sys = await deps().systemFor!(m, true);
      b = { ...rest, ...sys };
    }
    return b;
  };
  interface UsageMeta {
    promptTokenCount?: number; candidatesTokenCount?: number;
    thoughtsTokenCount?: number; cachedContentTokenCount?: number;
  }
  const usageBox: { last: UsageMeta | null } = { last: null };

  while (true) {
  attempt++;
  fullText = '';
  modelUsed = modelAt(attempt);
  if (attempt > 1) console.warn('[fallback] percobaan %d → model %s', attempt, modelUsed);
  let upstreamError: string | null = null;
  let cacheExpired = false;
  let retryNeeded = false;
  let quotaFull = false;
  let finishReason: string | null = null;

  const ctrl = new AbortController();
  const hardTimer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);

  let firstTokenSeen = false;
  let streamHidup    = false;
  const watchdog = setTimeout(() => {
    if (!streamHidup) {
      console.warn('[stream] %d dtk tanpa satu chunk pun — batalkan & ulang', FIRST_TOKEN_TIMEOUT_MS / 1000);
      ctrl.abort();
    }
  }, FIRST_TOKEN_TIMEOUT_MS);

  try {
    await deps().stream(clampThinking(await bodyFor(modelUsed), modelUsed), modelUsed, c => {
      if (c.error) {
        if (c.code === 429) { quotaFull = true; ctrl.abort(); return; }
        upstreamError = String(c.error);
        cacheExpired = c.cacheExpired === true;
        ctrl.abort();
        return;
      }
      if (c.live && !streamHidup) { streamHidup = true; clearTimeout(watchdog); }
      if (c.usageMetadata) usageBox.last = c.usageMetadata;
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
      continue;
    }
    throw new Error('KUOTA_PENUH');
  }

  if (upstreamError && cacheExpired && !fullText.trim() && !noCache && !pastDeadline()) {
    console.warn('[prompt-cache] cache expired di Google — ulang di %s tanpa cache', modelUsed);
    noCache = true;
    attempt--;
    continue;
  }

  if (upstreamError) {
    if (fullText.trim()) {
      console.warn('[stream] upstream error setelah sebagian teks:', upstreamError);
      fullText += STREAM_CUT_NOTE;
      onChunk(STREAM_CUT_NOTE);
    } else if (attempt < MAX_ATTEMPT && !pastDeadline()) {
      console.warn('[stream] upstream gagal (%s) — percobaan %d/%d, pindah model', upstreamError, attempt, MAX_ATTEMPT);
      await tunggu(300);
      retryNeeded = true;
    } else {
      throw new Error(`Stream terputus: ${upstreamError}`);
    }
  }

  if (!retryNeeded && !firstTokenSeen && !fullText.trim() && !upstreamError && attempt < MAX_ATTEMPT && !pastDeadline()) {
    console.warn('[stream] tak ada token sama sekali — percobaan %d/%d, pindah model', attempt, MAX_ATTEMPT);
    await tunggu(300);
    continue;
  }
  if (!retryNeeded && !upstreamError && !usageBox.last && !looksComplete(fullText) && attempt < MAX_ATTEMPT && !pastDeadline()) {
    console.warn('[stream] jawaban sepotong (%d huruf, tanpa stempel usage) — percobaan %d/%d, ulangi', fullText.trim().length, attempt, MAX_ATTEMPT);
    if (fullText) onChunk('\n\n');
    await tunggu(attempt * 900);
    continue;
  }
  if (!retryNeeded && !upstreamError && finishReason && finishReason !== 'STOP') {
    if (attempt < MAX_ATTEMPT && !pastDeadline()) {
      console.warn('[stream] finishReason=%s setelah %d huruf — percobaan %d/%d, ulangi', finishReason, fullText.trim().length, attempt, MAX_ATTEMPT);
      if (fullText) onChunk('\n\n');
      await tunggu(attempt * 900);
      continue;
    }
    console.warn('[stream] finishReason=%s tetap setelah %d percobaan — beri catatan', finishReason, attempt);
    fullText += STREAM_HALT_NOTE;
    onChunk(STREAM_HALT_NOTE);
  }

  if (retryNeeded) continue;
  break;
  }

  addUsage(usageBox.last?.promptTokenCount, usageBox.last?.candidatesTokenCount,
           usageBox.last?.thoughtsTokenCount, usageBox.last?.cachedContentTokenCount);
  {
    const inp = usageBox.last?.promptTokenCount ?? 0;
    const cache = usageBox.last?.cachedContentTokenCount ?? 0;
    const lvlTerkirim = clampThinking(body, modelUsed).generationConfig?.thinkingConfig?.thinkingLevel;
    deps().meta.modelUsed = modelUsed;
    console.info('[tokens] model=%s think=%s%s in=%d (prompt-cache %d%%) out=%d thinking=%d',
      modelUsed, lvlTerkirim, deps().thinkOverride ? ' (override, cache jawaban dilewati)' : '',
      inp, inp ? Math.round((cache / inp) * 100) : 0,
      usageBox.last?.candidatesTokenCount ?? 0, usageBox.last?.thoughtsTokenCount ?? 0);
  }
  return collapseDegenerateLoops(fullText);
}
