
import { useState, useEffect, useRef } from 'react';
import { UnitModel, SessionMeta } from '../types';
import { cn } from '../lib/utils';
import { PanelLeft, Plus, LogOut, ChevronsUpDown, ChevronRight, Trash2, X, KeyRound, HelpCircle, Sun, Moon, Bookmark, Search, WifiOff } from 'lucide-react';
import { ExcavatorIcon, WheelLoaderIcon } from './UnitIcons';
import { relativeTime } from '../lib/relativeTime';
import { PocketItem } from '../services/storage';
import { SupportModal } from './SupportModal';
import { ChangePasswordDialog } from './ChangePasswordDialog';

import { m, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';

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

export const MODEL_GROUPS: { type: string; models: UnitModel[] }[] = [
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
  isOffline?: boolean;
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
  isOffline = false,
}: SidebarProps) {
  const [historyQuery, setHistoryQuery] = useState('');
  const filteredSessions = historyQuery.trim()
    ? sessions.filter(s => (s.title + ' ' + s.model).toLowerCase().includes(historyQuery.trim().toLowerCase()))
    : sessions;
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [expandedType, setExpandedType] = useState<string>(() => {
    const group = MODEL_GROUPS.find(g => g.models.includes(selectedModel));
    return group?.type ?? MODEL_GROUPS[0].type;
  });
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setShowUserMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowUserMenu(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [showUserMenu]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const SIDEBAR_W = isMobile ? 300 : 260;

  return (
    <>
      <AnimatePresence>
        {isMobile && !isCollapsed && (
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 sidebar-scrim z-10 md:hidden"
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
          "bg-[var(--bg-sidebar)] flex flex-col z-20 overflow-hidden border-r border-[var(--border-main)]",
          isMobile ? cn("absolute top-0 left-0 h-full", !isCollapsed && "sidebar-drawer") : "relative shrink-0 h-full"
        )}
      >
        <div style={{ width: SIDEBAR_W }} className="flex flex-col h-full">

          <div className="sidebar-header flex items-center justify-between pl-6 pr-4 pb-3 shrink-0">
            <img src="/hexindo-wordmark-v2.png" alt="Hexindo" className="sidebar-wordmark sidebar-wordmark-light" />
            <img src="/hexindo-wordmark-dark-v2.png" alt="Hexindo" className="sidebar-wordmark sidebar-wordmark-dark" />
            <div className="flex items-center gap-1">
              {!isMobile && onThemeToggle && (
                <button
                  onClick={onThemeToggle}
                  className="p-1.5 hover:bg-white/8 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
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

          <nav className="px-2 pt-1 shrink-0 flex flex-col gap-px">
            <button onClick={() => { onNewChat(); if (isMobile) onToggle(); }} className="sb-row">
              <span className="sb-new-icon"><Plus size={15} strokeWidth={2.25} /></span>
              <span>New chat</span>
            </button>
            <button
              onClick={() => { setShowSearch(v => !v); setHistoryQuery(''); }}
              aria-expanded={showSearch}
              className={cn("sb-row", showSearch && "is-active")}
            >
              <Search size={17} />
              <span>Search</span>
            </button>
            {pocketItems.length > 0 && (
              <button
                onClick={() => setShowBookmarks(v => !v)}
                aria-expanded={showBookmarks}
                className={cn("sb-row", showBookmarks && "is-active")}
              >
                <Bookmark size={17} />
                <span>Bookmark</span>
                {isOffline && <span className="offline-pill"><WifiOff size={9} /> offline</span>}
                <span className="sb-count">{pocketItems.length}</span>
              </button>
            )}
          </nav>

          {showSearch && (
            <div className="px-2 pt-2 shrink-0">
              <div className="history-search">
                <Search size={13} className="shrink-0 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  style={{ fontSize: '16px' }}
                  value={historyQuery}
                  onChange={e => setHistoryQuery(e.target.value)}
                  placeholder="Cari riwayat…"
                  aria-label="Cari riwayat"
                />
                {historyQuery && (
                  <button onClick={() => setHistoryQuery('')} aria-label="Hapus pencarian" className="text-[var(--text-muted)]"><X size={13} /></button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-2 pb-2">
            <AnimatePresence initial={false}>
              {showBookmarks && pocketItems.length > 0 && (
                <m.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <p className="sb-label">Bookmark</p>
                  <div className="flex flex-col gap-px">
                    {pocketItems.map(item => (
                      <div key={item.id} className="relative group/pocket">
                        <button
                          onClick={() => { onOpenPocketItem?.(item); if (isMobile) onToggle(); }}
                          className="sb-row pr-10"
                        >
                          <span className="truncate">{pocketPreview(item.answer) || '(kosong)'}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeletePocketItem?.(item.id); }}
                          className={cn(
                            "absolute right-0.5 top-1/2 -translate-y-1/2 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all flex items-center justify-center",
                            isMobile ? "w-9 h-9 opacity-100" : "w-7 h-7 opacity-0 group-hover/pocket:opacity-100 focus-visible:opacity-100"
                          )}
                          title="Hapus dari Bookmark"
                          aria-label="Hapus dari Bookmark"
                        >
                          <Trash2 size={isMobile ? 14 : 12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {!showSearch && (
              <>
                <p className="sb-label">Model unit</p>
                <div className="flex flex-col gap-px">
                  {MODEL_GROUPS.map(({ type, models }) => {
                    const isOpen = expandedType === type;
                    return (
                      <div key={type}>
                        <button
                          onClick={() => setExpandedType(isOpen ? '' : type)}
                          aria-expanded={isOpen}
                          className="sb-row"
                        >
                          {type === 'Wheel Loader' ? <WheelLoaderIcon size={17} /> : <ExcavatorIcon size={17} />}
                          <span className="flex-1 truncate">{type}</span>
                          <ChevronRight size={14} className={cn("sb-chevron transition-transform duration-200", isOpen && "rotate-90")} />
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <m.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden flex flex-col gap-px"
                            >
                              {models.map((model) => {
                                const isActive = model === selectedModel;
                                return (
                                  <button
                                    key={model}
                                    onClick={() => { onSelectModel(model); setExpandedType(type); if (isMobile) onToggle(); }}
                                    aria-current={isActive}
                                    className={cn("sb-row sb-sub", isActive && "is-active")}
                                  >
                                    <span className={cn("sb-dot", isActive && "is-on")} />
                                    <span className="sb-unit truncate">{model}</span>
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
              </>
            )}

            <p className="sb-label">{showSearch ? 'Hasil pencarian' : 'Recents'}</p>
            {sessions.length === 0 ? (
              <p className="px-2.5 py-1.5 text-[13px] text-[var(--text-muted)]">Belum ada history chat</p>
            ) : filteredSessions.length === 0 ? (
              <p className="px-2.5 py-1.5 text-[13px] text-[var(--text-muted)]">Tidak ada yang cocok</p>
            ) : (
              <div className="flex flex-col gap-px">
                {filteredSessions.map((session) => {
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
                        aria-current={isActive}
                        title={`${session.model} · ${relativeTime(session.updatedAt)}`}
                        className={cn("sb-row pr-10", isActive && "is-active")}
                      >
                        <span className="truncate">{session.title}</span>
                      </button>
                      <AnimatePresence>
                        {(isMobile || hoveredSession === session.id) && (
                          <m.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.1 }}
                            onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                            className={cn(
                              "absolute right-0.5 top-1/2 -translate-y-1/2 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors flex items-center justify-center",
                              isMobile ? "w-9 h-9" : "w-7 h-7"
                            )}
                            title="Hapus sesi"
                            aria-label="Hapus percakapan"
                          >
                            <Trash2 size={isMobile ? 14 : 12} />
                          </m.button>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>


          <div className="shrink-0 px-2 pt-2 pb-3 border-t border-[var(--border-main)] sidebar-footer-safe">
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(v => !v)}
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
                className="sb-row sb-user"
              >
                <div className="w-7 h-7 rounded-full bg-[var(--accent-main)] flex items-center justify-center text-[12px] font-semibold text-white uppercase shrink-0">
                  {(user?.displayName || 'U')[0]}
                </div>
                <span className="flex-1 min-w-0 truncate text-left">
                  {user?.displayName || 'Operator'}
                  <span className="text-[var(--text-muted)]"> · {user?.role || 'Field Technician'}</span>
                </span>
                <ChevronsUpDown size={14} className="sb-chevron" />
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <m.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    role="menu"
                    className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl shadow-lg overflow-hidden"
                  >
                    <button
                      onClick={() => { setShowUserMenu(false); setShowChangePw(true); }}
                      disabled={user?.isDemoAccount}
                      title={user?.isDemoAccount ? 'Akun demo tidak bisa ubah password.' : undefined}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--text-primary)] hover:bg-white/5 transition-colors border-b border-[var(--border-main)]"
                    >
                      <KeyRound size={14} className="text-[var(--text-muted)]" />
                      <span>Ganti Password</span>
                    </button>
                    {user?.isDemoAccount && (
                      <p className="px-4 py-2 text-[12px] text-[var(--text-muted)]">Akun demo tidak bisa ubah password.</p>
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
            </div>
          </div>

        </div>
      </m.div>

      <SupportModal open={showSupport} onClose={() => setShowSupport(false)} />
      <ChangePasswordDialog open={showChangePw} onClose={() => setShowChangePw(false)} />
    </>
  );
}
