
import { useState, useEffect } from 'react';
import { UnitModel, SessionMeta } from '../types';
import { cn } from '../lib/utils';
import { PanelLeft, Plus, LogOut, MoreHorizontal, ChevronRight, Trash2, X, KeyRound, Loader2, CheckCircle2, HelpCircle, Sun, Moon, BarChart3, Bookmark, Tractor, History as HistoryIcon } from 'lucide-react';
import { supabase } from '../services/supabase';
import { PocketItem } from '../services/storage';
import { SupportModal } from './SupportModal';
import { MonitorModal } from './MonitorModal';

// Panel Monitoring khusus owner. HANYA untuk menyembunyikan tombolnya — gerbang
// sebenarnya ada di server (/v1/dashboard cek ADMIN_EMAILS terhadap token), jadi
// mengakali daftar ini di browser tetap dapat 403. Samakan isinya dengan env
// ADMIN_EMAILS di Cloud Run supaya tombol tidak muncul untuk orang yang ditolak server.
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? 'alvianur@gmail.com')
  .split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
import { m, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';

/** Label Bookmark — 2 kata pertama jawaban AI (markdown dilucuti), ringkas & rapi di sidebar. */
function pocketPreview(answer: string): string {
  return answer
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[#>\-*\s|:]+/gm, '')
    .replace(/[*_`#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

const MODEL_GROUPS: { type: string; models: UnitModel[] }[] = [
  { type: 'Mini Excavator', models: ['ZX48U-5A', 'ZX65USB-5A'] },
  { type: 'Medium Excavator', models: ['ZX138MF-5G', 'ZX200-5G'] },
  { type: 'Wheel Loader', models: ['KCM 60ZV', 'ZW140'] },
];

interface SidebarProps {
  selectedModel: UnitModel;
  onSelectModel: (model: UnitModel) => void;
  onNewChat: () => void;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onDeleteAllSessions: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
  theme?: 'dark' | 'light';
  onThemeToggle?: () => void;
  pocketItems?: PocketItem[];
  onOpenPocketItem?: (item: PocketItem) => void;
  onDeletePocketItem?: (id: string) => void;
}

export function Sidebar({
  selectedModel,
  onSelectModel,
  onNewChat,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onDeleteAllSessions,
  isCollapsed,
  onToggle,
  theme,
  onThemeToggle,
  pocketItems = [],
  onOpenPocketItem,
  onDeletePocketItem,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedType, setExpandedType] = useState<string>(() => {
    const group = MODEL_GROUPS.find(g => g.models.includes(selectedModel));
    return group?.type ?? MODEL_GROUPS[0].type;
  });
  const [showHistory, setShowHistory] = useState(true);
  // Bookmark auto-hide: tertutup default — buka saat diketuk
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const isAdmin = ADMIN_EMAILS.includes((user?.email ?? '').toLowerCase());

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleChangePassword = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setPwError(null);
    if (pwNew.length < 6) { setPwError('Password minimal 6 karakter.'); return; }
    if (pwNew !== pwConfirm) { setPwError('Password tidak cocok.'); return; }
    if (!supabase) { setPwError('Layanan tidak tersedia.'); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    setPwLoading(false);
    if (error) { setPwError(error.message || 'Gagal ganti password.'); return; }
    setPwSuccess(true);
    setTimeout(() => {
      setShowChangePw(false);
      setPwNew(''); setPwConfirm(''); setPwSuccess(false);
    }, 1500);
  };

  const SIDEBAR_W = isMobile ? 300 : 260;

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobile && !isCollapsed && (
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-10 md:hidden"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      <m.div
        initial={false}
        animate={
          isMobile
            ? { x: isCollapsed ? -SIDEBAR_W : 0, width: SIDEBAR_W }
            : { width: isCollapsed ? 0 : SIDEBAR_W }
        }
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "bg-[var(--bg-sidebar)] h-full flex flex-col z-20 overflow-hidden border-r border-[var(--border-main)]",
          isMobile ? "fixed inset-y-0 left-0 shadow-2xl rounded-r-2xl" : "relative shrink-0"
        )}
      >
        <div style={{ width: SIDEBAR_W }} className="flex flex-col h-full">

          {/* ── Header ── */}
          <div className="sidebar-header flex items-center justify-between px-4 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-[var(--accent-main)] flex items-center justify-center">
                <img src="/logo-64.png" alt="Dash⁵" className="w-full h-full object-cover" />
              </div>
              <span className="text-[15px] font-medium text-[var(--text-primary)] tracking-tight">Dash⁵</span>
            </div>
            <div className="flex items-center gap-1">
              {/* Theme toggle — desktop only */}
              {!isMobile && onThemeToggle && (
                <button
                  onClick={onThemeToggle}
                  className="p-1.5 hover:bg-white/8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Toggle tema"
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              )}
              <button
                onClick={onToggle}
                className="p-1.5 hover:bg-white/8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Tutup sidebar"
              >
                {isMobile ? <X size={15} /> : <PanelLeft size={15} />}
              </button>
            </div>
          </div>

          {/* ── New Chat ── */}
          <div className="px-3 pb-1 shrink-0">
            <button
              onClick={() => { onNewChat(); if (isMobile) onToggle(); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all group"
            >
              <Plus size={14} className="shrink-0 transition-colors text-[var(--accent-main)]" />
              <span className="text-[13px] font-medium">New chat</span>
            </button>
          </div>

          {/* ── Model Unit ── */}
          <div className="shrink-0 px-3 pb-1">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)] px-3 pt-4 pb-2">
              <Tractor size={12} /> Model Unit
            </p>
            {MODEL_GROUPS.map(({ type, models }) => {
              const isOpen = expandedType === type;
              const hasActive = models.includes(selectedModel);
              return (
                <div key={type}>
                  <button
                    onClick={() => setExpandedType(isOpen ? '' : type)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-colors duration-150 text-left",
                      hasActive
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                    )}
                  >
                    <span className="text-[13px] font-medium flex-1">{type}</span>
                    <ChevronRight
                      size={12}
                      className={cn("shrink-0 transition-transform duration-200", isOpen ? "rotate-90" : "")}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        {models.map((model) => {
                          const isActive = model === selectedModel;
                          return (
                            <button
                              key={model}
                              onClick={() => { onSelectModel(model); setExpandedType(type); if (isMobile) onToggle(); }}
                              className={cn(
                                "w-full flex items-center gap-2 pl-6 pr-3 py-2 rounded-xl transition-all text-left",
                                isActive
                                  ? "bg-[var(--accent-active)]/8"
                                  : "hover:bg-white/5"
                              )}
                            >
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                isActive ? "bg-[var(--accent-active)]" : "bg-[var(--text-muted)]/40"
                              )} />
                              <span className={cn(
                                "text-[13px] truncate",
                                isActive ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-primary)] font-normal"
                              )}>
                                {model}
                              </span>
                            </button>
                          );
                        })}
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* ── Bookmark — jawaban tersimpan, bisa dibaca offline. Hilang kalau kosong (quiet). ── */}
          {pocketItems.length > 0 && (
            <div className="shrink-0 px-3">
              {/* Divider — pemisah tegas antar section */}
              <div className="border-t border-[var(--border-main)] mt-3" />
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowBookmarks(v => !v)}
                onKeyDown={e => e.key === 'Enter' && setShowBookmarks(v => !v)}
                className="flex items-center justify-between px-3 py-1 cursor-pointer group/bm"
              >
                <p className="flex items-center gap-1.5 pt-3 pb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)] group-hover/bm:text-[var(--text-primary)] transition-colors">
                  <Bookmark size={11} /> Bookmark
                </p>
                <ChevronRight
                  size={11}
                  className={cn(
                    "text-[var(--text-muted)] group-hover/bm:text-[var(--text-secondary)] transition-all duration-200 mt-0.5",
                    showBookmarks ? "rotate-90" : ""
                  )}
                />
              </div>
              <AnimatePresence initial={false}>
                {showBookmarks && (
                  <m.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5 pb-1">
                      {pocketItems.map(item => (
                        <div key={item.id} className="relative group/pocket">
                          <button
                            onClick={() => { onOpenPocketItem?.(item); if (isMobile) onToggle(); }}
                            className="w-full text-left px-3 py-2 rounded-xl transition-colors duration-100 pr-8 hover:bg-white/5 active:bg-white/8 group/pbtn"
                          >
                            {/* Label ringkas: 2 kata pertama jawaban AI */}
                            <span className="block truncate text-[12.5px] text-[var(--text-secondary)] group-hover/pbtn:text-[var(--text-primary)] transition-colors">
                              {pocketPreview(item.answer) || '(kosong)'}
                            </span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeletePocketItem?.(item.id); }}
                            className={cn(
                              "absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all",
                              isMobile ? "opacity-100" : "opacity-0 group-hover/pocket:opacity-100"
                            )}
                            title="Hapus dari Bookmark"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── History header ── */}
          <div className="shrink-0 px-3">
            {/* Divider — pemisah tegas antar section */}
            <div className="border-t border-[var(--border-main)] mt-3" />
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowHistory(v => !v)}
              onKeyDown={e => e.key === 'Enter' && setShowHistory(v => !v)}
              className="flex items-center justify-between px-3 py-1 cursor-pointer group/hist"
            >
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)] group-hover/hist:text-[var(--text-primary)] transition-colors pt-3 pb-2">
                <HistoryIcon size={12} /> History
              </p>
              <ChevronRight
                size={11}
                className={cn(
                  "text-[var(--text-muted)] group-hover/hist:text-[var(--text-secondary)] transition-all duration-200 mt-0.5",
                  showHistory ? "rotate-90" : ""
                )}
              />
            </div>
          </div>

          {/* ── Riwayat items (scrollable) ── */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-2">
            <AnimatePresence initial={false}>
              {showHistory && (
                <m.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  {sessions.length === 0 ? (
                    <div className="px-2 py-3 text-center">
                      <p className="text-[11px] text-[var(--text-muted)]">Belum ada history chat</p>
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
                                "w-full text-left px-3 py-2 rounded-xl text-[12.5px] transition-colors duration-100 pr-8 active:bg-white/8",
                                isActive
                                  // Aksen 2px tepi kiri (inset — tanpa geser layout): penanda "kamu di sini"
                                  ? "bg-[var(--accent-main)]/8 text-[var(--text-primary)] font-medium shadow-[inset_2px_0_0_var(--accent-main)]"
                                  : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                              )}
                            >
                              <span className="block truncate">{session.title}</span>
                            </button>
                            <AnimatePresence>
                              {(isMobile || hoveredSession === session.id) && (
                                <m.button
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  transition={{ duration: 0.1 }}
                                  onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                                  title="Hapus sesi"
                                >
                                  <Trash2 size={11} />
                                </m.button>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Footer ── */}
          <div className="shrink-0 px-3 pt-1 pb-3 sidebar-footer-safe">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 transition-all group"
              >
                <div className="w-[30px] h-[30px] rounded-full bg-[var(--accent-main)] flex items-center justify-center text-[12px] font-medium text-white uppercase shrink-0">
                  {(user?.displayName || 'U')[0]}
                </div>
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-[13px] font-medium text-[var(--text-primary)] leading-tight truncate w-full text-left">
                    {user?.displayName || 'Operator'}
                  </span>
                  <span className="text-[11px] font-normal text-[var(--text-muted)] leading-tight text-left">
                    {user?.role || 'Field Technician'}
                  </span>
                </div>
                <MoreHorizontal size={14} className="text-[var(--text-muted)] shrink-0" />
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <m.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl shadow-lg overflow-hidden"
                  >
                    <button
                      onClick={() => { setShowUserMenu(false); setShowChangePw(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--text-primary)] hover:bg-white/5 transition-colors border-b border-[var(--border-main)]"
                    >
                      <KeyRound size={14} className="text-[var(--text-muted)]" />
                      <span>Ganti Password</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setShowUserMenu(false); setShowMonitor(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--text-primary)] hover:bg-white/5 transition-colors border-b border-[var(--border-main)]"
                      >
                        <BarChart3 size={14} className="text-[var(--accent-main)]" />
                        <span>Monitoring Pemakaian</span>
                      </button>
                    )}
                    <button
                      onClick={() => { setShowUserMenu(false); setShowSupport(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--text-primary)] hover:bg-white/5 transition-colors border-b border-[var(--border-main)]"
                    >
                      <HelpCircle size={14} className="text-[var(--text-muted)]" />
                      <span>Bantuan & Support</span>
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); onDeleteAllSessions(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-red-400 hover:bg-red-500/8 transition-colors border-b border-[var(--border-main)]"
                    >
                      <Trash2 size={14} />
                      <span>Hapus Semua Riwayat</span>
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                    >
                      <LogOut size={14} className="text-[var(--text-muted)]" />
                      <span>Log out</span>
                    </button>
                  </m.div>
                )}
              </AnimatePresence>

              {/* ── Change Password Modal ── */}
              <AnimatePresence>
                {showChangePw && (
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
                    onClick={() => { if (!pwLoading) { setShowChangePw(false); setPwNew(''); setPwConfirm(''); setPwError(null); setPwSuccess(false); } }}
                  >
                    <m.div
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
                      onClick={e => e.stopPropagation()}
                    >
                      <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-4">Ganti Password</p>
                      {pwSuccess ? (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <CheckCircle2 className="w-8 h-8 text-green-400" />
                          <p className="text-[13px] text-[var(--text-secondary)]">Password berhasil diubah!</p>
                        </div>
                      ) : (
                        <form onSubmit={handleChangePassword} className="space-y-2.5">
                          <input
                            type="password"
                            value={pwNew}
                            onChange={e => setPwNew(e.target.value)}
                            placeholder="Password baru"
                            required
                            autoFocus
                            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-main)]/50 transition-colors"
                          />
                          <input
                            type="password"
                            value={pwConfirm}
                            onChange={e => setPwConfirm(e.target.value)}
                            placeholder="Konfirmasi password"
                            required
                            className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-main)]/50 transition-colors"
                          />
                          {pwError && <p className="text-[12px] text-red-400">{pwError}</p>}
                          <div className="flex gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => { setShowChangePw(false); setPwNew(''); setPwConfirm(''); setPwError(null); }}
                              className="flex-1 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={pwLoading}
                              className="flex-1 h-9 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all disabled:opacity-50 flex items-center justify-center"
                            >
                              {pwLoading ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}
                            </button>
                          </div>
                        </form>
                      )}
                    </m.div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </m.div>

      <SupportModal open={showSupport} onClose={() => setShowSupport(false)} />
      {isAdmin && <MonitorModal open={showMonitor} onClose={() => setShowMonitor(false)} />}
    </>
  );
}
