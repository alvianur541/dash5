/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
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

// Jika input sudah berformat email → pakai langsung, selainnya konversi ke internal email
function toAuthEmail(input: string) {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@dash5.internal`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
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
      if (event === 'SIGNED_OUT') { setUser(null); setIsRecoveryMode(false); }
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true);
      if (event === 'SIGNED_IN' && session?.user && !isRecoveryMode) {
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(username),
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
      redirectTo: 'https://dash5.my.id',
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
