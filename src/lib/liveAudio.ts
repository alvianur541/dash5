export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
// Avatar mouth/ring level: gain-scaled, clamped 0..1, fast attack and slow release.
export function createLevelSmoother(attack = 0.6, release = 0.15, gain = 4) {
  let v = 0;
  return (level: number) => {
    const target = Math.min(1, Math.max(0, level * gain));
    v += (target - v) * (target > v ? attack : release);
    return v;
  };
}
// Half-duplex guard: speaker echo must not reach the mic upload (iOS AEC is unreliable with WebAudio).
export function createEchoGate(tailMs: number) {
  let until = 0;
  return {
    speakingUntil(t: number) { until = Math.max(until, t); },
    cut(t: number) { until = t; },
    open: (t: number) => t > until + tailMs,
  };
}
export function liveSocketUrl(page: string, backend?: string): string {
  const url = new URL(backend ? '/v1/live' : '/api/v1/live', backend || page);
  if (backend) {
    const base = new URL(backend);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Invalid live backend');
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
export function createMonoResampler(rate: number) {
  const pending: number[] = []; let offset = 0, produced = 0;
  return (channels: Float32Array[]): Float32Array => {
    for (let i = 0; i < channels[0].length; i++) pending.push(channels.reduce((n, c) => n + c[i], 0) / channels.length);
    const target = Math.floor((offset + pending.length) * 16000 / rate);
    const out = new Float32Array(target - produced); let start = 0;
    for (let i = 0; i < out.length; i++) {
      const end = Math.floor((++produced) * rate / 16000) - offset;
      let value = 0;
      for (let j = start; j < end; j++) value += pending[j];
      out[i] = value / (end - start); start = end;
    }
    pending.splice(0, start); offset += start;
    return out;
  };
}
export function resampleMono(channels: Float32Array[], rate: number): Float32Array {
  return createMonoResampler(rate)(channels);
}
export function pcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2); const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => { const n = Math.min(1, Math.max(-1, sample)); view.setInt16(i * 2, n < 0 ? n * 32768 : n * 32767, true); });
  return bytes;
}
