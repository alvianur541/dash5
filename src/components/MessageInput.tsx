
import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { ArrowUp, Paperclip, Mic, Loader2, WifiOff, Square, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { cn } from '../lib/utils';
import { UnitModel } from '../types';
import { authHeaders, PROXY_URL } from '../services/ai';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: File[]) => void;
  disabled?: boolean;
  selectedModel: UnitModel;
  isOffline?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
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

const TRANSCRIBE_TIMEOUT_MS = 15_000;
const RECORD_MAX_SEC = 60;

async function transcribeWithProxy(base64Audio: string, mimeType: string): Promise<string> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${PROXY_URL}/v1/transcribe`, {
      method: 'POST', headers: await authHeaders(),
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
  const [recordSec, setRecordSec] = useState(0);
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (recordingState !== 'recording') { setRecordSec(0); return; }
    const t = setInterval(() => setRecordSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [recordingState]);

  useEffect(() => {
    if (recordingState === 'recording' && recordSec >= RECORD_MAX_SEC) mediaRecorderRef.current?.stop();
  }, [recordSec, recordingState]);


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

  const buzz = () => { try { navigator.vibrate?.(8); } catch { } };

  const resetBox = () => {
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '24px';
  };

  const handleSend = () => {
    if (isOffline || isStreaming || disabled) return;
    const text = input.trim();
    if (!text && !pending) return;
    buzz();
    onSendMessage(text, pending ? [pending.file] : undefined);
    resetBox();
    setPending(null);
  };

  const flash = (msg: string) => {
    setTranscribeError(msg);
    setTimeout(() => setTranscribeError(null), 3000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE_BYTES = 5 * 1024 * 1024;

    const file = e.target.files[0];
    e.target.value = '';
    if (!ALLOWED_TYPES.includes(file.type)) { flash('Hanya file gambar (JPG, PNG, WebP) yang diizinkan.'); return; }
    if (file.size > MAX_SIZE_BYTES) { flash(`Gambar terlalu besar (maks 5MB). Ukuran file: ${(file.size / 1024 / 1024).toFixed(1)}MB.`); return; }

    const { file: ready, compressed } = await compressImage(file);
    if (!compressed) flash('Compress gambar gagal — akan mengirim file original.');
    const url = await new Promise<string>(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : '');
      r.onerror = () => resolve('');
      r.readAsDataURL(ready);
    });
    setPending({ file: ready, url });
    textareaRef.current?.focus();
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
            setInput(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
            buzz();
            setTimeout(() => textareaRef.current?.focus(), 50);
          } else {
            flash('Suara tidak terbaca. Coba lagi.');
          }
        } catch {
          flash('Gagal transkripsi. Coba lagi.');
        } finally {
          setRecordingState('idle');
        }
      };
      recorder.start();
      setRecordingState('recording');
    } catch {
      flash('Akses mikrofon ditolak.');
    }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); };
  const toggleRecording = () => {
    if (recordingState === 'idle') startRecording();
    else if (recordingState === 'recording') stopRecording();
  };

  const canSend      = (input.trim().length > 0 || !!pending) && !disabled && !isOffline;
  const isRecording  = recordingState === 'recording';
  const isTranscribing = recordingState === 'transcribing';

  return (
    <div className="message-input-bar px-3 pt-0 pb-1 md:px-6 md:pt-1 flex flex-col">
      <div
        className="mx-auto w-full"
        style={{ maxWidth: 'var(--input-content-max)' }}
      >

        <div className={cn(
          "relative rounded-[22px] transition-all duration-150 shadow-sm",
          "bg-[var(--bg-card)] border",
          isRecording
            ? "border-red-500/40"
            : "border-[color-mix(in_srgb,var(--accent-main)_18%,transparent)] focus-within:border-[color-mix(in_srgb,var(--accent-main)_50%,transparent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-main)_10%,transparent),0_4px_16px_-6px_color-mix(in_srgb,var(--accent-main)_20%,transparent)]",
          disabled && "opacity-60"
        )}>

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
                    <span className="text-[11px] text-red-400 font-medium tabular-nums">Merekam {recordSec}s / {RECORD_MAX_SEC}s — ketuk stop</span>
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

          <AnimatePresence>
            {pending && (
              <m.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="px-4 pt-4 pb-1"
              >
                <div className="relative inline-block pt-2 pr-2">
                  <img src={pending.url} alt="Preview" className="h-[72px] w-auto max-w-[160px] object-cover rounded-xl border border-[var(--border-main)]" />
                  <button
                    onClick={() => setPending(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--text-primary)] text-[var(--bg-app)] flex items-center justify-center shadow"
                    aria-label="Hapus foto"
                  >
                    <X size={12} />
                  </button>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          <div className="px-5 pt-[14px] pb-[4px] flex flex-col justify-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); handleSend(); }
              }}
              enterKeyHint={isMobile ? 'enter' : 'send'}
              placeholder={
                isRecording || isTranscribing ? '' :
                isOffline ? 'Mode offline — chat aktif saat sinyal kembali…' :
                pending ? 'Tambah keterangan foto (opsional)…' :
                `Tanyakan tentang unit ${selectedModel}...`
              }
              rows={1}
              disabled={disabled || isTranscribing}
              style={{ height: '24px', resize: 'none' }}
              className="w-full bg-transparent border-none outline-none resize-none text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] py-0 leading-[24px] max-h-[80px] md:max-h-[120px] overflow-y-auto scrollbar-hide block"
            />
          </div>

          <div className="flex items-center px-3.5 pb-[13px] pt-0 gap-0.5">

            {isOffline ? (
              <WifiOff size={15} className="text-amber-400 mx-1.5 shrink-0" />
            ) : (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className="input-tool-btn"
                  title="Lampirkan gambar"
                  aria-label="Lampirkan gambar"
                >
                  <Paperclip size={18} />
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

            {!isOffline && (
              <button
                onClick={toggleRecording}
                disabled={disabled || isTranscribing}
                className={cn("input-tool-btn", isRecording && "input-tool-btn-rec")}
                title={isRecording ? 'Berhenti merekam' : 'Input suara'}
                aria-label={isRecording ? 'Berhenti merekam' : 'Input suara'}
              >
                {isTranscribing
                  ? <Loader2 size={18} className="animate-spin" />
                  : isRecording ? <Square size={14} fill="currentColor" /> : <Mic size={18} />
                }
              </button>
            )}

            <div className="flex-1" />

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

        <div className="hidden md:flex items-center justify-center mt-2 text-[11px] text-[var(--text-muted)] opacity-70">
          <span>Dash⁵ dapat keliru — verifikasi info penting.</span>
        </div>

      </div>
      <div className="safe-area-spacer" />
    </div>
  );
}
