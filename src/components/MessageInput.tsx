/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useLayoutEffect } from 'react';
import { ArrowUp, Paperclip, Mic, MicOff, Loader2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { cn } from '../lib/utils';
import { UnitModel } from '../types';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: File[]) => void;
  disabled?: boolean;
  selectedModel: UnitModel;
}

type RecordingState = 'idle' | 'recording' | 'transcribing';

// ── Transcription via proxy ───────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

async function transcribeWithProxy(base64Audio: string, mimeType: string): Promise<string> {
  const proxyUrl = import.meta.env.VITE_VERTEX_PROXY_URL ?? '';

  const res = await fetch(`${proxyUrl}/v1/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: base64Audio, mimeType }),
  });

  if (!res.ok) throw new Error(`Transcribe error ${res.status}`);
  const data = await res.json();
  return data.text ?? '';
}

// ── Image compression (canvas resize → JPEG 0.82) ────────────────────────────
async function compressImage(file: File): Promise<File> {
  const MAX_PX = 1024;
  const QUALITY = 0.82;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_PX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      canvas.getContext('2d')!.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        blob => resolve(blob
          ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
          : file),
        'image/jpeg', QUALITY
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MessageInput({
  onSendMessage,
  disabled,
  selectedModel,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const fileInputRef      = useRef<HTMLInputElement>(null);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);

  // Auto-resize textarea — useLayoutEffect prevents height flash on initial render
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = window.innerWidth < 768 ? 80 : 120;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [input]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB raw (will be compressed)
    const MAX_FILES = 5;

    let errorMsg: string | null = null;
    const valid = Array.from(e.target.files).filter(f => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        errorMsg = 'Hanya file gambar (JPG, PNG, WebP, GIF) yang diizinkan.';
        return false;
      }
      if (f.size > MAX_SIZE) {
        errorMsg = 'File terlalu besar (maks 10MB).';
        return false;
      }
      return true;
    }).slice(0, MAX_FILES);

    if (valid.length < Array.from(e.target.files).length && !errorMsg)
      errorMsg = `Maksimal ${MAX_FILES} file lampiran.`;

    if (errorMsg) {
      setTranscribeError(errorMsg);
      setTimeout(() => setTranscribeError(null), 3000);
    }

    e.target.value = '';
    if (valid.length === 0) return;

    // Compress & auto-send immediately
    const compressed = await Promise.all(valid.map(compressImage));
    const currentInput = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSendMessage(currentInput, compressed);
  };

  // ── Voice recording ─────────────────────────────────────────────────────────
  const startRecording = async () => {
    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

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
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            onSendMessage(combined);
          }
        } catch (err: any) {
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

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const toggleRecording = () => {
    if (recordingState === 'idle') startRecording();
    else if (recordingState === 'recording') stopRecording();
  };

  const canSend = input.trim().length > 0 && !disabled;
  const isRecording = recordingState === 'recording';
  const isTranscribing = recordingState === 'transcribing';

  return (
    <div className="shrink-0 bg-[var(--bg-app)] px-3 pt-3 pb-1 md:px-4 md:pt-3 md:pb-2 flex flex-col justify-end transition-colors duration-400" style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom, 4px))' }}>
      <div className="max-w-3xl mx-auto w-full space-y-0">

        {/* Input Box */}
        <div className={cn(
          "relative rounded-2xl border bg-[var(--bg-card)] transition-all duration-200",
          isRecording
            ? "border-red-500/40 shadow-lg shadow-red-500/5"
            : disabled
            ? "border-[var(--border-main)] opacity-60"
            : "border-[var(--border-main)] focus-within:border-white/15 focus-within:shadow-lg"
        )}>

          {/* Recording / transcribing status — absolute overlay, tidak menambah tinggi box */}
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
                    <span className="text-[11px] text-red-400 font-medium">Merekam... ketuk mic untuk berhenti</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3 h-3 text-[var(--accent-main)] animate-spin shrink-0" />
                    <span className="text-[11px] text-[var(--accent-main)] font-medium">Mentranskrip suara...</span>
                  </>
                )}
              </m.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isRecording ? '' :
              isTranscribing ? '' :
              `Tanyakan tentang unit ${selectedModel}...`
            }
            rows={1}
            disabled={disabled || isTranscribing}
            style={{ height: '38px', resize: 'none' }}
            className="w-full bg-transparent border-none outline-none resize-none text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] px-4 pt-2 pb-0.5 leading-relaxed max-h-[80px] md:max-h-[120px] overflow-y-auto scrollbar-hide"
          />

          {/* Bottom Bar */}
          <div className="flex items-center px-3 pb-1.5 pt-0.5 gap-1">
            {/* Attach */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all disabled:opacity-40"
              title="Lampirkan gambar"
            >
              <Paperclip size={17} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              multiple
              accept="image/*"
              className="hidden"
            />

            {/* Mic / Voice input */}
            <button
              onClick={toggleRecording}
              disabled={disabled || isTranscribing}
              className={cn(
                "p-2 rounded-xl transition-all disabled:opacity-40",
                isRecording
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
              )}
              title={isRecording ? 'Stop recording' : 'Voice input (Gemini STT)'}
            >
              {isTranscribing
                ? <Loader2 size={17} className="animate-spin" />
                : isRecording
                ? <MicOff size={17} />
                : <Mic size={17} />
              }
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "p-2 rounded-xl transition-all shrink-0",
                canSend
                  ? "bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 active:scale-95 shadow-sm"
                  : "bg-white/5 text-[var(--text-muted)] cursor-not-allowed"
              )}
            >
              <ArrowUp size={17} />
            </button>
          </div>
        </div>

        {/* Error / Disclaimer */}
        <AnimatePresence>
          {transcribeError ? (
            <m.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-[11px] text-red-400 font-medium"
            >
              {transcribeError}
            </m.p>
          ) : (
            <p className="text-center text-[10px] text-[var(--text-muted)] font-medium mt-1">
              Dash⁵ is AI and can make mistakes.
            </p>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
