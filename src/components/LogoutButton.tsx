'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useServerAuth } from './ServerAuthProvider';
import { useCustomer } from './CustomerProvider';

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useServerAuth();
  const { logout: logoutDemo } = useCustomer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function leave() {
    setBusy(true); setError('');
    try { await logout(); logoutDemo(); router.replace('/login'); router.refresh(); }
    catch { setError('Sign-out failed. Please try again.'); setBusy(false); }
  }
  return <><button type="button" className="button button-secondary" disabled={busy} onClick={leave}><LogOut size={18} />{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p className="error-message" role="alert">{error}</p>}</>;
}
