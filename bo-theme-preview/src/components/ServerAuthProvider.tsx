"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export type ServerAccount = { id: string; displayName: string; roles: ('traveler' | 'provider' | 'guide' | 'admin')[]; onboarding: 'pending' | 'completed'; revision: number };
const AuthContext = createContext<{ account: ServerAccount | null; ready: boolean; error: string; refresh: () => Promise<void>; logout: () => Promise<void> }>({ account: null, ready: false, error: '', refresh: async () => {}, logout: async () => {} });

export function ServerAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<ServerAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const signingOut = useRef(false);
  const refresh = useCallback(async () => {
    if (signingOut.current) return;
    const current = ++requestId.current;
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!response.ok) throw new Error('Your session could not be checked. Please try again.');
      const body = await response.json();
      if (current !== requestId.current) return;
      setAccount(body.account ?? null);
      setError('');
    } catch {
      // A failed check does not prove the session expired; retain the last verified account.
      if (current === requestId.current) setError('Your session could not be checked. Please try again.');
    } finally {
      if (current === requestId.current) setReady(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { requestId.current++; window.removeEventListener('focus', refresh); };
  }, [pathname, refresh]);
  async function logout() {
    signingOut.current = true;
    requestId.current++;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign-out failed. Please try again.');
      setAccount(null);
      setError('');
      setReady(true);
    } finally { signingOut.current = false; }
  }
  return <AuthContext.Provider value={{ account, ready, error, refresh, logout }}>{children}</AuthContext.Provider>;
}
export function useServerAuth() { return useContext(AuthContext); }
