"use client";
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type ServerAccount = { id: string; displayName: string; roles: ('traveler' | 'provider' | 'guide' | 'admin')[]; onboarding: 'pending' | 'completed'; revision: number };
const AuthContext = createContext<{ account: ServerAccount | null; ready: boolean; logout: () => Promise<void> }>({ account: null, ready: false, logout: async () => {} });

export function ServerAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<ServerAccount | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const body = await response.json();
        if (active) setAccount(response.ok ? body.account : null);
      } catch { if (active) setAccount(null); }
      finally { if (active) setReady(true); }
    };
    void refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [pathname]);
  async function logout() {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Sign-out failed. Please try again.');
    window.google?.accounts.id.disableAutoSelect();
    setAccount(null);
  }
  return <AuthContext.Provider value={{ account, ready, logout }}>{children}</AuthContext.Provider>;
}
export function useServerAuth() { return useContext(AuthContext); }
