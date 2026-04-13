/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Paperclip, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../lib/utils';
import { UnitModel } from '../types';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: File[]) => void;
  disabled?: boolean;
  selectedModel: UnitModel;
  onSelectModel: (model: UnitModel) => void;
}

export function MessageInput({
  onSendMessage,
  disabled,
  selectedModel,
  onSelectModel,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
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
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div className="shrink-0 bg-[var(--bg-app)] px-3 pb-2 pt-1 md:px-4 md:pb-3 md:pt-1 transition-colors duration-400">
      <div className="max-w-3xl mx-auto space-y-2">

        {/* Attachment Previews */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Box */}
        <div className={cn(
          "relative rounded-2xl border bg-[var(--bg-card)] transition-all duration-200",
          disabled
            ? "border-[var(--border-main)] opacity-60"
            : "border-[var(--border-main)] focus-within:border-white/15 focus-within:shadow-lg"
        )}>
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
            placeholder={`Tanyakan tentang unit ${selectedModel}...`}
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent border-none outline-none resize-none text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] px-4 pt-2.5 pb-0.5 leading-relaxed max-h-[120px] overflow-y-auto scrollbar-hide"
          />

          {/* Bottom Bar */}
          <div className="flex items-center justify-between px-3 pb-1.5 pt-0.5 gap-2">
            {/* Left: Attach */}
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

            {/* Right: Send Button */}
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

        {/* Disclaimer */}
        <p className="text-center text-[10px] text-[var(--text-muted)] font-medium">
          Dash⁵ dapat membuat kesalahan. Selalu verifikasi kembali sebelum melakukan perbaikan di unit.
        </p>
      </div>
    </div>
  );
}
