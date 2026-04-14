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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('dash-user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (user) localStorage.setItem('dash-user', JSON.stringify(user));
    else localStorage.removeItem('dash-user');
  }, [user]);

  const login = async (username: string, password: string) => {
    setAuthError(null);
    await new Promise(r => setTimeout(r, 400));

    if (!supabase) {
      setAuthError('Layanan autentikasi tidak tersedia.');
      return;
    }

    // Authenticate against Supabase app_users table
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, display_name, role')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      setAuthError('Username atau password salah.');
      return;
    }

    setUser({
      uid: data.id,
      displayName: data.display_name,
      role: data.role,
      email: null,
    });
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, loading: false, login, logout, authError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
