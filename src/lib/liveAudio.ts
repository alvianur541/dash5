export function resampleMono(channels: Float32Array[], rate: number): Float32Array {
  const length = Math.floor(channels[0].length * 16000 / rate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * rate / 16000), end = Math.max(start + 1, Math.floor((i + 1) * rate / 16000));
    let value = 0;
    for (const channel of channels) for (let j = start; j < end; j++) value += channel[j] || 0;
    out[i] = value / ((end - start) * channels.length);
  }
  return out;
}
export function pcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2); const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => { const n = Math.min(1, Math.max(-1, sample)); view.setInt16(i * 2, n < 0 ? n * 32768 : n * 32767, true); });
  return bytes;
}
