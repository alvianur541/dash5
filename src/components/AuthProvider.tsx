
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
  if (!supabase) return `${trimmed.toLowerCase()}@dash5.internal`;
  const nik = trimmed.toUpperCase();
  // M-2: pakai RPC SECURITY DEFINER (lookup_auth_email) — 1 NIK → 1 email, TANPA
  // enumeration. RPC dulu; kalau belum ter-deploy, fallback ke tabel (perilaku lama).
  // Setelah migrasi (RPC dibuat + policy anon SELECT dicabut), jalur tabel otomatis mati
  // dan RPC yang dipakai → enumeration NIK→email lewat anon key tertutup.
  try {
    const { data, error } = await supabase.rpc('lookup_auth_email', { p_nik: nik });
    if (!error && typeof data === 'string' && data) return data;
  } catch { /* RPC belum ada → fallback di bawah */ }
  try {
    const { data } = await supabase
      .from('user_niks')
      .select('auth_email')
      .eq('nik', nik)
      .single();
    return data?.auth_email ?? `${trimmed.toLowerCase()}@dash5.internal`;
  } catch {
    return `${trimmed.toLowerCase()}@dash5.internal`;
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
