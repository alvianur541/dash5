
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

interface AuthUser {
  uid: string;
  displayName: string;
  role: string;
  email: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isRecoveryMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendResetEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function resolveAuthEmail(input: string): Promise<string> {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed;
  const fallback = `${trimmed.toLowerCase()}@dash5.internal`;
  if (!supabase) return fallback;
  try {
    // RPC, BUKAN select ke user_niks. Lookup ini jalan sebelum login (pakai anon key
    // yang ada di bundle), jadi kalau tabelnya bisa dibaca langsung, siapa pun bisa
    // mengunduh seluruh daftar NIK + email admin. RPC hanya menjawab satu NIK yang
    // sudah diketahui penanya — resolve tetap bisa, enumerasi tidak.
    const { data } = await supabase.rpc('resolve_auth_email', { p_nik: trimmed });
    return typeof data === 'string' && data ? data : fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const recoveryRef = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const timeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        setUser({
          uid: session.user.id,
          displayName: meta.display_name || 'Operator',
          role: meta.role || 'Field Technician',
          email: session.user.email ?? null,
        });
      }
      setLoading(false);
    }).catch(() => { clearTimeout(timeout); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setIsRecoveryMode(false); recoveryRef.current = false; }
      if (event === 'PASSWORD_RECOVERY') { setIsRecoveryMode(true); recoveryRef.current = true; }
      if (event === 'SIGNED_IN' && session?.user && !recoveryRef.current) {
        const meta = session.user.user_metadata || {};
        setUser({
          uid: session.user.id,
          displayName: meta.display_name || 'Operator',
          role: meta.role || 'Field Technician',
          email: session.user.email ?? null,
        });
      }
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  const login = async (username: string, password: string) => {
    setAuthError(null);
    if (!supabase) { setAuthError('Layanan tidak tersedia.'); return; }

    const authEmail = await resolveAuthEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (error || !data.user) {
      const msg = error?.message ?? '';
      if (msg.includes('invalid_credentials') || msg.includes('Invalid login')) {
        setAuthError('Username atau password salah.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setAuthError('Gagal terhubung ke server. Cek koneksi kamu.');
      } else {
        setAuthError(msg || 'Login gagal. Coba lagi.');
      }
      return;
    }

    const meta = data.user.user_metadata || {};
    setUser({
      uid: data.user.id,
      displayName: meta.display_name || 'Operator',
      role: meta.role || 'Field Technician',
      email: data.user.email ?? null,
    });
  };

  const logout = async () => {
    await supabase?.auth.signOut();
    setUser(null);
    setIsRecoveryMode(false);
  };

  const sendResetEmail = async (email: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Layanan tidak tersedia.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: import.meta.env.VITE_SITE_URL ?? window.location.origin,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const updatePassword = async (newPassword: string): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Layanan tidak tersedia.' };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    setIsRecoveryMode(false);
    return { ok: true };
  };

  return (
    <AuthContext.Provider value={{ user, loading, isRecoveryMode, login, logout, sendResetEmail, updatePassword, authError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
