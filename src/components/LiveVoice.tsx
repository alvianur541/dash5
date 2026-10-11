import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../services/supabase';
import { pcm16, resampleMono } from '../lib/liveAudio';

export function LiveVoice({ unit }: { unit: string }) {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Mikrofon mati');
  const [transcript, setTranscript] = useState('');
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), [unit]);
  const start = async () => {
    if (active) return;
    setActive(true); setTranscript(''); setStatus('Menghubungkan…');
    let stopped = false, stream: MediaStream | undefined, ws: WebSocket | undefined, processor: ScriptProcessorNode | undefined;
    const audio = new AudioContext();
    const playing = new Set<AudioBufferSourceNode>(); let next = 0;
    const clear = () => { for (const source of playing) { try { source.stop(); } catch { /* already ended */ } } playing.clear(); next = audio.currentTime; };
    const hidden = () => { if (document.hidden) stop(); };
    const stop = () => {
      if (stopped) return; stopped = true;
      document.removeEventListener('visibilitychange', hidden);
      clear(); if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
      stream?.getTracks().forEach(track => track.stop());
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      ws?.close(); void audio.close(); setActive(false);
    };
    stopRef.current = () => { stop(); setStatus('Mikrofon mati'); };
    document.addEventListener('visibilitychange', hidden);
    try {
      await audio.resume();
      const token = await getAuthToken(); if (stopped) return;
      if (!token || !navigator.mediaDevices?.getUserMedia) throw new Error('Login atau mikrofon tidak tersedia.');
      const url = new URL('/api/v1/live', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(url);
      const timeout = setTimeout(() => { setStatus('Live belum tersedia. Gunakan chat teks.'); stop(); }, 20000);
      ws.onopen = () => { if (!stopped) ws?.send(JSON.stringify({ type: 'auth', token, unit })); };
      ws.onerror = () => { clearTimeout(timeout); setStatus('Koneksi suara gagal. Gunakan chat teks.'); stop(); };
      ws.onclose = () => { clearTimeout(timeout); if (!stopped) { setStatus('Live terputus. Gunakan chat teks.'); stop(); } };
      ws.onmessage = async event => {
        try {
          const m = JSON.parse(event.data);
          if (m.type === 'error') { setStatus(m.message); stop(); return; }
          if (m.type === 'ready') {
            clearTimeout(timeout);
            stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
            if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
            const input = audio.createMediaStreamSource(stream);
            processor = audio.createScriptProcessor(2048, 1, 1);
            const pending: number[] = [];
            processor.onaudioprocess = e => {
              if (stopped || ws?.readyState !== WebSocket.OPEN) return;
              const channels = Array.from({ length: e.inputBuffer.numberOfChannels }, (_, i) => e.inputBuffer.getChannelData(i));
              pending.push(...resampleMono(channels, audio.sampleRate));
              while (pending.length >= 640) {
                if (ws.bufferedAmount > 65536) { setStatus('Jaringan lambat. Gunakan chat teks.'); stop(); return; }
                const bytes = pcm16(new Float32Array(pending.splice(0, 640)));
                ws.send(JSON.stringify({ type: 'audio', data: btoa(String.fromCharCode(...bytes)) }));
              }
            };
            input.connect(processor); const mute = audio.createGain(); mute.gain.value = 0; processor.connect(mute); mute.connect(audio.destination);
            setStatus('Mikrofon aktif — bicara, atau tekan Hentikan');
          }
          const c = m.content;
          if (!c || stopped) return;
          if (c.interrupted) clear();
          const text = c.outputTranscription?.text || c.inputTranscription?.text;
          if (text) setTranscript(old => (old + text).slice(-2000));
          for (const part of c.modelTurn?.parts || []) {
            if (!part.inlineData?.data || !part.inlineData.mimeType?.startsWith('audio/pcm')) continue;
            if (next - audio.currentTime > 10) throw new Error('Audio queue full');
            const raw = atob(part.inlineData.data); const bytes = Uint8Array.from(raw, x => x.charCodeAt(0)); const view = new DataView(bytes.buffer);
            const buffer = audio.createBuffer(1, bytes.length / 2, 24000); const samples = buffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
            const source = audio.createBufferSource(); source.buffer = buffer; source.connect(audio.destination); playing.add(source); source.onended = () => playing.delete(source);
            next = Math.max(next, audio.currentTime); source.start(next); next += buffer.duration;
          }
        } catch { setStatus('Suara tidak tersedia atau izin mikrofon ditolak. Gunakan chat teks.'); stop(); }
      };
    } catch { setStatus('Mikrofon tidak tersedia atau izin ditolak. Gunakan chat teks.'); stop(); }
  };
  return <section aria-label="Percakapan suara" className="shrink-0 border-b border-[var(--border-color)] px-4 py-2 text-sm">
    <div className="flex items-center justify-between gap-2"><span>Percakapan suara</span>
      <button type="button" className="text-[var(--accent-main)] font-semibold" onClick={active ? () => stopRef.current() : start}>{active ? 'Hentikan' : 'Mulai suara'}</button></div>
    <p role="status" className="text-xs text-[var(--text-muted)]">{status}</p>
    {transcript && <p className="max-h-20 overflow-auto mt-1 text-sm">{transcript}</p>}
  </section>;
}
