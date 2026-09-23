const FRAME_MS = 40;
const MIN_CHARS_PER_SEC = 90;
const CATCH_UP_MS = 450;
const FINISH_MIN_MS = 250;
const FINISH_MAX_MS = 900;
const WORD_REACH = 14;
const TABLE_ROW_RE = /^\s*\|/;

// Hides half-written markdown at the streaming edge so raw pipes and asterisks never flash on screen.
export function tidyStreamingTail(text: string): string {
  const lines = text.split('\n');
  let tail = lines.pop() ?? '';
  if (TABLE_ROW_RE.test(tail)) tail = '';
  if (!tail) {
    let run = 0;
    while (run < lines.length && TABLE_ROW_RE.test(lines[lines.length - 1 - run])) run++;
    if (run === 1) lines.pop();
  }
  const odd = (re: RegExp) => (tail.match(re) ?? []).length % 2 === 1;
  if (odd(/`/g)) tail = tail.replace(/`$/, '');
  if (odd(/`/g)) tail += '`';
  if (odd(/\*\*/g)) tail = tail.replace(/\*+$/, '');
  if (odd(/\*\*/g)) tail = tail.trimEnd() + '**';
  return lines.length ? `${lines.join('\n')}\n${tail}` : tail;
}

// Releases streamed text at a steady, backlog-adaptive rate instead of in network-sized lumps.
export function createPacer(render: (text: string) => void, isActive: () => boolean) {
  let shown = '';
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTick = 0;
  let finishRate = 0;
  let drained: (() => void) | null = null;

  const settle = () => { const d = drained; drained = null; d?.(); };

  const take = (dt: number): number => {
    const rate = finishRate || pending.length / CATCH_UP_MS;
    let n = Math.max(Math.ceil(rate * dt), Math.ceil(MIN_CHARS_PER_SEC * dt / 1000));
    if (n < pending.length) {
      const gap = pending.slice(n, n + WORD_REACH).search(/\s/);
      return gap >= 0 ? n + gap + 1 : n;
    }
    if (finishRate) return pending.length;
    // More text is coming: hold a half-received word until the rest of it arrives.
    const partial = /\S+$/.exec(pending);
    if (partial && partial[0].length <= WORD_REACH) n = partial.index;
    return Math.min(n, pending.length);
  };

  const tick = () => {
    timer = null;
    if (!isActive()) { settle(); return; }
    const now = performance.now();
    const dt = Math.min(now - lastTick, 250);
    lastTick = now;
    const n = take(dt);
    if (n > 0) {
      shown += pending.slice(0, n);
      pending = pending.slice(n);
      render(shown);
    }
    if (!pending) settle();
    else if (n > 0 || finishRate) timer = setTimeout(tick, FRAME_MS);
  };

  const schedule = () => {
    if (timer !== null || !pending) return;
    lastTick = performance.now() - FRAME_MS;
    timer = setTimeout(tick, FRAME_MS);
  };

  return {
    push(chunk: string) { pending += chunk; schedule(); },
    text: () => shown + pending,
    // Server's final text wins; it only animates when it continues what is already on screen.
    finish(full: string): Promise<void> {
      if (!isActive()) return Promise.resolve();
      if (!full.startsWith(shown) || document.hidden) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        shown = full;
        pending = '';
        render(full);
        return Promise.resolve();
      }
      pending = full.slice(shown.length);
      if (!pending) return Promise.resolve();
      finishRate = pending.length / Math.min(FINISH_MAX_MS, Math.max(FINISH_MIN_MS, pending.length / 2));
      return new Promise(resolve => { drained = resolve; schedule(); });
    },
    cancel() { if (timer !== null) clearTimeout(timer); timer = null; settle(); },
  };
}
