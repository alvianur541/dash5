import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../services/supabase';
import { authHeaders, PROXY_URL } from '../services/ai';
import { pcm16, createMonoResampler, createEchoGate, liveSocketUrl, rms } from '../lib/liveAudio';
import { createLiveTranscript } from '../lib/liveTranscript';
import type { Message } from '../types';

type LiveContent = {
  interrupted?: boolean; turnComplete?: boolean;
  inputTranscription?: { text?: string }; outputTranscription?: { text?: string };
  modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
};
export type LivePhase = 'idle' | 'connecting' | 'listening' | 'searching' | 'speaking';

// Live session: mic -> server relay -> audio playback; transcripts surface as chat messages.
export function useLiveVoice(uid: string | undefined, unit: string, onMessage: (m: Message) => void, onTurnEnd: () => void, onEnd: (error?: string) => void) {
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [allowed, setAllowed] = useState<{ uid?: string; ok: boolean }>({ ok: false });
  useEffect(() => {
    if (!uid) return;
    let live = true;
    authHeaders()
      .then(headers => fetch(`${PROXY_URL}/v1/live/access`, { headers }))
      .then(r => r.ok ? r.json() : { allowed: false })
      .then(d => { if (live) setAllowed({ uid, ok: d.allowed === true }); })
      .catch(() => { if (live) setAllowed({ uid, ok: false }); });
    return () => { live = false; };
  }, [uid]);
  const stopRef = useRef<() => void>(() => {});
  const interruptRef = useRef<() => void>(() => {});
  const outLevel = useRef<() => number>(() => 0);
  const micLevel = useRef(0);
  const busyRef = useRef(false);
  const cb = useRef({ onMessage, onTurnEnd, onEnd });
  useEffect(() => { cb.current = { onMessage, onTurnEnd, onEnd }; });
  useEffect(() => () => stopRef.current(), [unit]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('connecting');
    const transcript = createLiveTranscript();
    const gate = createEchoGate(400);
    let skipTurn = false;
    let stopped = false, stream: MediaStream | undefined, ws: WebSocket | undefined, processor: ScriptProcessorNode | undefined;
    const audio = new AudioContext();
    const analyser = audio.createAnalyser(); analyser.fftSize = 512; analyser.connect(audio.destination);
    const scope = new Float32Array(analyser.fftSize);
    outLevel.current = () => { if (stopped || !playing.size) return 0; analyser.getFloatTimeDomainData(scope); return rms(scope); };
    const playing = new Set<AudioBufferSourceNode>(); let next = 0;
    const clear = () => { for (const source of playing) { try { source.stop(); } catch { /* already ended */ } } playing.clear(); next = audio.currentTime; };
    const hidden = () => { if (document.hidden) stop(); };
    const stop = (error?: string) => {
      if (stopped) return; stopped = true; busyRef.current = false;
      document.removeEventListener('visibilitychange', hidden);
      clear(); if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
      stream?.getTracks().forEach(track => track.stop());
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      outLevel.current = () => 0; micLevel.current = 0;
      ws?.close(); void audio.close(); setPhase('idle'); cb.current.onEnd(error);
    };
    stopRef.current = () => stop();
    interruptRef.current = () => { if (stopped) return; skipTurn = true; clear(); gate.cut(Date.now()); setPhase('listening'); };
    document.addEventListener('visibilitychange', hidden);
    try {
      await audio.resume();
      const token = await getAuthToken(); if (stopped) return;
      if (!token || !navigator.mediaDevices?.getUserMedia) throw new Error('Login atau mikrofon tidak tersedia.');
      ws = new WebSocket(liveSocketUrl(location.href, import.meta.env.VITE_LIVE_BACKEND_URL));
      const timeout = setTimeout(() => stop('Live belum tersedia. Gunakan chat teks.'), 35000);
      ws.onopen = () => { if (!stopped) ws?.send(JSON.stringify({ type: 'auth', token, unit })); };
      ws.onerror = () => { clearTimeout(timeout); stop('Koneksi Live gagal. Gunakan chat teks.'); };
      ws.onclose = () => { clearTimeout(timeout); if (!stopped) stop('Live terputus. Gunakan chat teks.'); };
      ws.onmessage = async event => {
        try {
          const m = JSON.parse(event.data);
          if (m.type === 'error') { stop(m.message); return; }
          if (m.type === 'searching') { setPhase('searching'); return; }
          if (m.type === 'answer' && typeof m.text === 'string') { for (const msg of transcript.answer(m.text)) cb.current.onMessage(msg); setPhase(playing.size ? 'speaking' : 'listening'); return; }
          if (m.type === 'ready') {
            clearTimeout(timeout);
            stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
            if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
            const input = audio.createMediaStreamSource(stream);
            processor = audio.createScriptProcessor(2048, 1, 1);
            const pending: number[] = []; const resample = createMonoResampler(audio.sampleRate);
            processor.onaudioprocess = e => {
              if (stopped || ws?.readyState !== WebSocket.OPEN) return;
              if (!gate.open(Date.now())) { pending.length = 0; micLevel.current = 0; return; }
              const channels = Array.from({ length: e.inputBuffer.numberOfChannels }, (_, i) => e.inputBuffer.getChannelData(i));
              micLevel.current = rms(channels[0]);
              pending.push(...resample(channels));
              while (pending.length >= 640) {
                if (ws.bufferedAmount > 65536) { stop('Jaringan lambat. Gunakan chat teks.'); return; }
                const bytes = pcm16(new Float32Array(pending.splice(0, 640)));
                ws.send(JSON.stringify({ type: 'audio', data: btoa(String.fromCharCode(...bytes)) }));
              }
            };
            input.connect(processor); const mute = audio.createGain(); mute.gain.value = 0; processor.connect(mute); mute.connect(audio.destination);
            setPhase('listening');
          }
          const c: LiveContent | undefined = m.content;
          if (!c || stopped) return;
          if (c.interrupted) { clear(); setPhase('listening'); }
          for (const msg of transcript.apply(c)) cb.current.onMessage(msg);
          if (c.turnComplete || c.interrupted) cb.current.onTurnEnd();
          const skip = skipTurn;
          if (c.turnComplete || c.interrupted) skipTurn = false;
          if (skip) return;
          for (const part of c.modelTurn?.parts || []) {
            if (!part.inlineData?.data || !part.inlineData.mimeType?.startsWith('audio/pcm')) continue;
            if (next - audio.currentTime > 10) throw new Error('Audio queue full');
            const raw = atob(part.inlineData.data); const bytes = Uint8Array.from(raw, x => x.charCodeAt(0)); const view = new DataView(bytes.buffer);
            const buffer = audio.createBuffer(1, bytes.length / 2, 24000); const samples = buffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
            const source = audio.createBufferSource(); source.buffer = buffer; source.connect(analyser); playing.add(source);
            source.onended = () => { playing.delete(source); if (!playing.size && !stopped) setPhase('listening'); };
            next = Math.max(next, audio.currentTime); source.start(next); next += buffer.duration;
            gate.speakingUntil(Date.now() + (next - audio.currentTime) * 1000);
            setPhase('speaking');
          }
        } catch { stop('Suara tidak tersedia atau izin mikrofon ditolak. Gunakan chat teks.'); }
      };
    } catch { stop('Mikrofon tidak tersedia atau izin ditolak. Gunakan chat teks.'); }
  }, [unit]);

  const stop = useCallback(() => stopRef.current(), []);
  const interrupt = useCallback(() => interruptRef.current(), []);
  return { phase, active: phase !== 'idle', allowed: !!uid && allowed.uid === uid && allowed.ok, start, stop, interrupt, outLevel, micLevel };
}

