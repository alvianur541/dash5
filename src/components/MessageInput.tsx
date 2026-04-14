/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useLayoutEffect } from 'react';
import { ArrowUp, Paperclip, X, Mic, MicOff, Loader2 } from 'lucide-react';
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

// ── Component ─────────────────────────────────────────────────────────────────
export function MessageInput({
  onSendMessage,
  disabled,
  selectedModel,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
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
    if (!input.trim() && attachments.length === 0) return;
    onSendMessage(input.trim(), attachments);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      const MAX_FILES = 5;
      let errorMsg: string | null = null;

      const valid = Array.from(e.target.files).filter(f => {
        if (!ALLOWED_TYPES.includes(f.type)) {
          errorMsg = 'Hanya file gambar (JPG, PNG, WebP, GIF) yang diizinkan.';
          return false;
        }
        if (f.size > MAX_SIZE) {
          errorMsg = 'File terlalu besar (maks 5MB).';
          return false;
        }
        return true;
      });

      const remaining = MAX_FILES - attachments.length;
      const toAdd = valid.slice(0, remaining);
      if (valid.length > remaining) errorMsg = `Maksimal ${MAX_FILES} file lampiran.`;

      if (errorMsg) {
        setTranscribeError(errorMsg);
        setTimeout(() => setTranscribeError(null), 3000);
      }
      if (toAdd.length > 0) setAttachments(prev => [...prev, ...toAdd]);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
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
            setAttachments([]);
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

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !disabled;
  const isRecording = recordingState === 'recording';
  const isTranscribing = recordingState === 'transcribing';

  return (
    <div className="shrink-0 bg-[var(--bg-app)] px-3 pb-2 pt-1 md:px-4 md:pb-3 md:pt-2 transition-colors duration-400">
      <div className="max-w-3xl mx-auto space-y-2">

        {/* Attachment Previews */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 px-1"
            >
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                >
                  <Paperclip className="w-3 h-3 text-[var(--accent-main)] shrink-0" />
                  <span className="truncate max-w-[140px]">{file.name}</span>
                  <button
                    onClick={() => removeAttachment(i)}
                    className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X className="w-3 h-3 text-[var(--text-muted)]" />
                  </button>
                </div>
              ))}
            </m.div>
          )}
        </AnimatePresence>

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
            <p className="text-center text-[10px] text-[var(--text-muted)] font-medium">
              Dash⁵ bisa keliru, selalu periksa kembali jawaban
            </p>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
