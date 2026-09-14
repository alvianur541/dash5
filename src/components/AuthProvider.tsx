
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { passkeySupported, countPasskeys, passkeyOfferSnoozed, snoozePasskeyOffer, passkeyCancelled, passkeyErrorMessage } from '../services/passkey';

interface AuthUser {
  uid: string;
  displayName: string;
  role: string;
  email: string | null;
}

export type PasskeyPromptMode = 'offer' | 'menu';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithPasskey: () => Promise<'ok' | 'cancelled' | 'error'>;
  logout: () => Promise<void>;
  authError: string | null;
  passkeyPrompt: PasskeyPromptMode | null;
  openPasskeyPrompt: () => void;
  closePasskeyPrompt: (snooze: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAuthUser(u: User): AuthUser {
  const meta = u.user_metadata || {};
  return {
    uid: u.id,
    displayName: meta.display_name || 'Operator',
    role: meta.role || 'Field Technician',
    email: u.email ?? null,
  };
}

async function resolveAuthEmail(input: string): Promise<string> {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed;
  const fallback = `${trimmed.toLowerCase()}@dash5.internal`;
  if (!supabase) return fallback;
  try {
    const { data } = await supabase.rpc('resolve_auth_email', { p_nik: trimmed });
    return typeof data === 'string' && data ? data : fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [passkeyPrompt, setPasskeyPrompt] = useState<PasskeyPromptMode | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    const timeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      if (session?.user) setUser(toAuthUser(session.user));
      setLoading(false);
    }).catch(() => { clearTimeout(timeout); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null);
      if (event === 'SIGNED_IN' && session?.user) setUser(toAuthUser(session.user));
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  const offerPasskey = async (uid: string) => {
    if (passkeyOfferSnoozed(uid) || !(await passkeySupported())) return;
    if ((await countPasskeys()) === 0) setPasskeyPrompt('offer');
  };

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

    const signedIn = toAuthUser(data.user);
    setUser(signedIn);
    void offerPasskey(signedIn.uid);
  };

  const loginWithPasskey = async (): Promise<'ok' | 'cancelled' | 'error'> => {
    setAuthError(null);
    if (!supabase) { setAuthError('Layanan tidak tersedia.'); return 'error'; }
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error || !data?.user) {
        if (passkeyCancelled(error)) return 'cancelled';
        setAuthError(passkeyErrorMessage(error));
        return 'error';
      }
      setUser(toAuthUser(data.user));
      return 'ok';
    } catch (err) {
      if (passkeyCancelled(err)) return 'cancelled';
      setAuthError(passkeyErrorMessage(err));
      return 'error';
    }
  };

  const logout = async () => {
    setPasskeyPrompt(null);
    await supabase?.auth.signOut();
    setUser(null);
  };

  const openPasskeyPrompt = () => setPasskeyPrompt('menu');

  const closePasskeyPrompt = (snooze: boolean) => {
    if (snooze && user) snoozePasskeyOffer(user.uid);
    setPasskeyPrompt(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPasskey, logout, authError, passkeyPrompt, openPasskeyPrompt, closePasskeyPrompt }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
