
import { useState, useRef, useLayoutEffect } from 'react';
import { ArrowUp, Paperclip, Mic, MicOff, Loader2, WifiOff, Square } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { cn } from '../lib/utils';
import { UnitModel } from '../types';
import { getAuthToken } from '../services/supabase';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: File[]) => void;
  disabled?: boolean;
  selectedModel: UnitModel;
  isOffline?: boolean;
  isStreaming?: boolean;      // jawaban sedang streaming → tombol kirim jadi tombol Stop
  onStop?: () => void;        // hentikan streaming yang sedang berjalan
}

type RecordingState = 'idle' | 'recording' | 'transcribing';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string)?.split(',')[1];
      if (base64) resolve(base64);
      else reject(new Error('Invalid audio data URL'));
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

const TRANSCRIBE_TIMEOUT_MS = 15_000; // 15s — cukup untuk audio panjang, cegah hang 60s

async function transcribeWithProxy(base64Audio: string, mimeType: string): Promise<string> {
  const proxyUrl = import.meta.env.VITE_VERTEX_PROXY_URL ?? '';
  const token    = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${proxyUrl}/v1/transcribe`, {
      method: 'POST', headers,
      body: JSON.stringify({ audio: base64Audio, mimeType }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Transcribe error ${res.status}`);
    const data = await res.json();
    return data.text ?? '';
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error(`Transcribe timeout ${TRANSCRIBE_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

type CompressResult = { file: File; compressed: boolean };

async function compressImage(file: File): Promise<CompressResult> {
  const MAX_PX = 1024;
  const QUALITY = 0.82;
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve({ file, compressed: false }), 8000);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_PX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve({ file, compressed: false }); return; }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        blob => resolve(blob
          ? { file: new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }), compressed: true }
          : { file, compressed: false }),
        'image/jpeg', QUALITY
      );
    };
    img.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); resolve({ file, compressed: false }); };
    img.src = url;
  });
}

export function MessageInput({
  onSendMessage, disabled, selectedModel, isOffline = false, isStreaming = false, onStop,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const fileInputRef     = useRef<HTMLInputElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!input) {
      el.style.height = '24px';
      return;
    }
    el.style.height = '24px';
    const maxH = window.innerWidth < 768 ? 80 : 120;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [input]);

  // Android only, no-op elsewhere.
  const buzz = () => { try { navigator.vibrate?.(8); } catch { /* unsupported */ } };

  const handleSend = () => {
    // Prevent two streams on one session.
    if (!input.trim() || isOffline || isStreaming) return;
    buzz();
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '24px';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — setelah compress ~1-2MB, aman untuk localStorage

    // One photo only.
    const file = e.target.files[0];
    let errorMsg: string | null = null;
    const valid: File[] = [];
    if (!ALLOWED_TYPES.includes(file.type)) {
      errorMsg = 'Hanya file gambar (JPG, PNG, WebP) yang diizinkan.';
    } else if (file.size > MAX_SIZE_BYTES) {
      errorMsg = `Gambar terlalu besar (maks 5MB). Ukuran file: ${(file.size / 1024 / 1024).toFixed(1)}MB.`;
    } else {
      valid.push(file);
    }
    if (errorMsg) {
      setTranscribeError(errorMsg);
      setTimeout(() => setTranscribeError(null), 3000);
    }
    e.target.value = '';
    if (valid.length === 0) return;

    const results = await Promise.allSettled(valid.map(compressImage));
    const compressed = results
      .filter((r): r is PromiseFulfilledResult<CompressResult> => r.status === 'fulfilled')
      .map(r => r.value);
    if (compressed.length === 0) return;

    // Compress failed -> send original.
    const anyFallback = compressed.some(r => !r.compressed);
    if (anyFallback) {
      setTranscribeError('Compress gambar gagal — mengirim file original.');
      setTimeout(() => setTranscribeError(null), 3000);
    }
    const files = compressed.map(r => r.file);

    const currentInput = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '24px';
    buzz();
    onSendMessage(currentInput, files);
  };

  const startRecording = async () => {
    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecordingState('transcribing');
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        try {
          const base64 = await blobToBase64(blob);
          const text = await transcribeWithProxy(base64, mimeType);
          if (text) {
            const currentInput = textareaRef.current?.value?.trim() || '';
            const combined = currentInput ? `${currentInput} ${text}` : text;
            setInput('');
            if (textareaRef.current) textareaRef.current.style.height = '24px';
            buzz();
            onSendMessage(combined);
          }
        } catch {
          setTranscribeError('Gagal transkripsi. Coba lagi.');
          setTimeout(() => setTranscribeError(null), 3000);
        } finally {
          setRecordingState('idle');
        }
      };
      recorder.start();
      setRecordingState('recording');
    } catch {
      setTranscribeError('Akses mikrofon ditolak.');
      setTimeout(() => setTranscribeError(null), 3000);
    }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); };
  const toggleRecording = () => {
    if (recordingState === 'idle') startRecording();
    else if (recordingState === 'recording') stopRecording();
  };

  const canSend      = input.trim().length > 0 && !disabled && !isOffline;
  const isRecording  = recordingState === 'recording';
  const isTranscribing = recordingState === 'transcribing';

  return (
    <div className="message-input-bar px-3 pt-0 pb-1 md:px-6 md:pt-1 flex flex-col">
      <div
        className="mx-auto w-full"
        style={{ maxWidth: 'var(--input-content-max)' }}
      >

        {/* Input pill — AndalAI-style: soft peach orange border, subtle elevation, focus accent */}
        <div className={cn(
          "relative rounded-[22px] transition-all duration-150 shadow-sm",
          "bg-[var(--bg-card)] border",
          isRecording
            ? "border-red-500/40"
            : "border-[color-mix(in_srgb,var(--accent-main)_18%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent-main)_50%,transparent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-main)_10%,transparent),0_4px_16px_-6px_color-mix(in_srgb,var(--accent-main)_20%,transparent)]",
          disabled && "opacity-60"
        )}>

          {/* Recording / transcribing overlay */}
          <AnimatePresence>
            {(isRecording || isTranscribing) && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-0 left-0 right-0 flex items-center gap-2 px-4 pt-2.5 pointer-events-none"
              >
                {isRecording ? (
                  <>
                    <m.div
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-red-500 shrink-0"
                    />
                    <span className="text-[11px] text-red-400 font-medium">Merekam… ketuk mic untuk berhenti</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3 h-3 text-[var(--accent-main)] animate-spin shrink-0" />
                    <span className="text-[11px] text-[var(--accent-main)] font-medium">Mentranskrip suara…</span>
                  </>
                )}
              </m.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <div className="px-5 pt-[14px] pb-[4px] flex flex-col justify-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={
                isRecording || isTranscribing ? '' :
                isOffline ? 'Mode offline — chat aktif saat sinyal kembali…' :
                `Tanyakan tentang unit ${selectedModel}...`
              }
              rows={1}
              disabled={disabled || isTranscribing}
              style={{ height: '24px', resize: 'none' }}
              className="w-full bg-transparent border-none outline-none resize-none text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] py-0 leading-[24px] max-h-[80px] md:max-h-[120px] overflow-y-auto scrollbar-hide block"
            />
          </div>

          {/* Bottom bar */}
          <div className="flex items-center px-3.5 pb-[13px] pt-0 gap-0.5">

            {/* Offline indicator OR attach button */}
            {isOffline ? (
              <WifiOff size={15} className="text-amber-400 mx-1.5 shrink-0" />
            ) : (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all disabled:opacity-40"
                  title="Lampirkan gambar"
                >
                  <Paperclip size={17} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept="image/*"
                  className="hidden"
                />
              </>
            )}

            {/* Mic — hidden offline */}
            {!isOffline && (
              <button
                onClick={toggleRecording}
                disabled={disabled || isTranscribing}
                className={cn(
                  "p-2 rounded-xl transition-all disabled:opacity-40",
                  isRecording
                    ? "text-red-400"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                )}
                title={isRecording ? 'Stop recording' : 'Voice input'}
              >
                {isTranscribing
                  ? <Loader2 size={17} className="animate-spin" />
                  : isRecording ? <MicOff size={17} /> : <Mic size={17} />
                }
              </button>
            )}

            <div className="flex-1" />

            {/* Send button: compact square control. Saat streaming → tombol Stop. */}
            {isStreaming && onStop ? (
              <button
                onClick={onStop}
                className="w-9 h-9 md:w-[30px] md:h-[30px] rounded-lg flex items-center justify-center transition-all active:scale-95 shrink-0 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-85"
                title="Hentikan jawaban"
                aria-label="Hentikan jawaban"
              >
                <Square size={11} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  "w-9 h-9 md:w-[30px] md:h-[30px] rounded-lg flex items-center justify-center transition-all active:scale-95 shrink-0",
                  canSend
                    ? "bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-85"
                    : "send-btn-inactive cursor-not-allowed"
                )}
                title="Kirim"
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Error toast */}
        <AnimatePresence>
          {transcribeError && (
            <m.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center text-[11px] text-red-400 font-medium pt-1"
            >
              {transcribeError}
            </m.p>
          )}
        </AnimatePresence>

        {/* Desktop disclaimer */}
        <div className="hidden md:flex items-center justify-center mt-2 text-[11px] text-[var(--text-muted)] opacity-70">
          <span>Dash⁵ dapat keliru — verifikasi info penting.</span>
        </div>

      </div>
      {/* safe-area-spacer di BAWAH: browser=0px, standalone PWA=env(safe-area-inset-bottom) */}
      <div className="safe-area-spacer" />
    </div>
  );
}
