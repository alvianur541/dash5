/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { UnitModel, SessionMeta } from '../types';
import { cn } from '../lib/utils';
import { PanelLeft, Plus, LogOut, ChevronUp, ChevronRight, Wrench, Sun, Moon, Zap, Trash2, X } from 'lucide-react';

const MODEL_GROUPS: { type: string; models: UnitModel[] }[] = [
  { type: 'Mini Excavator', models: ['ZX48U-5A', 'ZX65USB-5A'] },
  { type: 'Medium Excavator', models: ['ZX138MF-5G', 'ZX200-5G'] },
];
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';

interface SidebarProps {
  selectedModel: UnitModel;
  onSelectModel: (model: UnitModel) => void;
  onNewChat: () => void;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}


export function Sidebar({
  selectedModel,
  onSelectModel,
  onNewChat,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  isCollapsed,
  onToggle,
  theme,
  onThemeToggle,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedType, setExpandedType] = useState<string>(() => {
    const group = MODEL_GROUPS.find(g => g.models.includes(selectedModel));
    return group?.type ?? MODEL_GROUPS[0].type;
  });
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const SIDEBAR_W = isMobile ? 280 : 260;

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobile && !isCollapsed && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-10 md:hidden"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={false}
        animate={
          isMobile
            ? { x: isCollapsed ? -SIDEBAR_W : 0, width: SIDEBAR_W }
            : { width: isCollapsed ? 0 : SIDEBAR_W }
        }
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "bg-[var(--bg-sidebar)] h-full flex flex-col z-20 overflow-hidden border-r border-[var(--border-main)]",
          isMobile ? "fixed inset-y-0 left-0 shadow-2xl" : "relative shrink-0"
        )}
      >
        <div style={{ width: SIDEBAR_W }} className="flex flex-col h-full">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent-main)] flex items-center justify-center shrink-0">
                <Wrench className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[15px] font-bold text-[var(--text-primary)] tracking-tight">Dash⁵</span>
            </div>
            <button
              onClick={onToggle}
              className="p-1.5 hover:bg-white/5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Tutup sidebar"
            >
              {isMobile ? <X size={16} /> : <PanelLeft size={16} />}
            </button>
          </div>

          {/* ── New Chat ── */}
          <div className="px-3 mb-1 shrink-0">
            <button
              onClick={() => { onNewChat(); if (isMobile) onToggle(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-[var(--text-primary)] transition-all group"
            >
              <Plus size={17} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
              <span className="text-sm font-medium">New chat</span>
            </button>
          </div>

          {/* ── Scrollable Content ── */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-3 space-y-4 py-2">

            {/* Model Selector — grouped by type */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] px-2 pt-1">
                Model Unit
              </p>
              {MODEL_GROUPS.map(({ type, models }) => {
                const isOpen = expandedType === type;
                const hasActive = models.includes(selectedModel);
                return (
                  <div key={type}>
                    {/* Type header */}
                    <button
                      onClick={() => setExpandedType(isOpen ? '' : type)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left",
                        hasActive
                          ? "text-[var(--accent-main)]"
                          : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                      )}
                    >
                      <Zap size={12} className="shrink-0" />
                      <span className="text-xs font-bold flex-1">{type}</span>
                      <ChevronRight
                        size={13}
                        className={cn(
                          "shrink-0 transition-transform duration-200",
                          isOpen ? "rotate-90" : ""
                        )}
                      />
                    </button>

                    {/* Models inside type */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden pl-3"
                        >
                          {models.map((model) => {
                            const isActive = model === selectedModel;
                            return (
                              <button
                                key={model}
                                onClick={() => { onSelectModel(model); if (isMobile) onToggle(); }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left",
                                  isActive
                                    ? "bg-[var(--accent-main)]/10 border border-[var(--accent-main)]/20"
                                    : "hover:bg-white/5 border border-transparent"
                                )}
                              >
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full shrink-0",
                                  isActive ? "bg-[var(--accent-main)]" : "bg-[var(--text-muted)]"
                                )} />
                                <span className={cn(
                                  "text-xs font-semibold truncate",
                                  isActive ? "text-[var(--accent-main)]" : "text-[var(--text-primary)]"
                                )}>
                                  {model}
                                </span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Session History */}
            <div className="space-y-1">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="w-full flex items-center justify-between px-2 pt-1 pb-0.5 group/hist"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] group-hover/hist:text-[var(--text-primary)] transition-colors">
                  Riwayat
                </p>
                <ChevronRight
                  size={12}
                  className={cn(
                    "text-[var(--text-muted)] group-hover/hist:text-[var(--text-primary)] transition-all duration-200",
                    showHistory ? "rotate-90" : ""
                  )}
                />
              </button>

              <AnimatePresence initial={false}>
                {showHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {sessions.length === 0 ? (
                      <div className="px-2 py-3 text-center">
                        <p className="text-[11px] text-[var(--text-muted)]">Belum ada riwayat chat</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {sessions.map((session) => {
                          const isActive = session.id === currentSessionId;
                          return (
                            <div
                              key={session.id}
                              className="relative group/item"
                              onMouseEnter={() => setHoveredSession(session.id)}
                              onMouseLeave={() => setHoveredSession(null)}
                            >
                              <button
                                onClick={() => { onSelectSession(session.id); if (isMobile) onToggle(); }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-xl text-xs transition-all pr-8",
                                  isActive
                                    ? "bg-white/8 text-[var(--text-primary)] font-medium"
                                    : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                                )}
                              >
                                <span className="block truncate">{session.title}</span>
                              </button>

                              <AnimatePresence>
                                {hoveredSession === session.id && (
                                  <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.1 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteSession(session.id);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                                    title="Hapus sesi"
                                  >
                                    <Trash2 size={12} />
                                  </motion.button>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* ── Footer ── */}
          <div className="shrink-0 px-3 py-3 border-t border-[var(--border-main)] space-y-1">
            <button
              onClick={onThemeToggle}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="text-sm">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all group"
              >
                <div className="w-7 h-7 rounded-lg bg-[var(--bg-card)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)] uppercase border border-[var(--border-main)] shrink-0">
                  {(user?.displayName || 'U')[0]}
                </div>
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-sm font-semibold text-[var(--text-primary)] leading-tight truncate w-full text-left">
                    {user?.displayName || 'Operator'}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight text-left">
                    {(user as any)?.role || 'Field Technician'}
                  </span>
                </div>
                <ChevronUp
                  size={14}
                  className={cn(
                    "text-[var(--text-muted)] transition-transform shrink-0",
                    showUserMenu ? "rotate-180" : ""
                  )}
                />
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl shadow-lg overflow-hidden"
                  >
                    <button
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                    >
                      <LogOut size={15} className="text-[var(--text-muted)]" />
                      <span>Log out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </motion.div>
    </>
  );
}
