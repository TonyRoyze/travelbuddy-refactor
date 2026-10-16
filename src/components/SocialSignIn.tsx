'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCustomer } from './CustomerProvider';

type Provider = 'google' | 'facebook' | 'apple';
const providers: { id: Provider; name: string; mark: string }[] = [
  { id: 'google', name: 'Google', mark: 'G' },
  { id: 'facebook', name: 'Facebook', mark: 'f' },
  { id: 'apple', name: 'Apple', mark: '●' },
];

export function SocialSignIn({ registration = false, next = '/account' }: { registration?: boolean; next?: string }) {
  const params = useSearchParams();
  const { logout: logoutDemo } = useCustomer();
  const [enabled, setEnabled] = useState<Partial<Record<Provider, boolean>> | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState(params.has('error') ? 'Sign-in could not be completed. Please try again.' : '');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setEnabled(null);
    fetch('/api/auth/providers', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setEnabled(body.providers);
      }).catch(() => { if (!controller.signal.aborted) setError('Sign-in is temporarily unavailable. Please try again.'); });
    return () => controller.abort();
  }, [retry]);
  async function signIn(provider: Provider) {
    if (busy) return;
    setBusy(provider); setError('');
    try {
      const response = await fetch('/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, next }) });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.error || 'Sign-in could not be started.');
      logoutDemo();
      window.location.assign(body.url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); setBusy(null); }
  }
  return <section className="social-sign-in" aria-label={registration ? 'Create an account' : 'Sign in'} aria-busy={Boolean(busy)}>
    <div className="social-sign-in-options">{providers.map(provider => <button key={provider.id} type="button" className={`social-sign-in-button social-${provider.id}`} disabled={Boolean(busy) || !enabled?.[provider.id]} onClick={() => void signIn(provider.id)}>
      <span className="social-provider-mark" aria-hidden="true">{provider.id === 'apple' ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17.1 12.3c0-2.4 2-3.6 2.1-3.6-1.1-1.6-2.7-1.8-3.3-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.9-1.6 0-3.1 1-3.9 2.4-1.7 2.9-.4 7.1 1.2 9.4.8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3.1-.7 1.4 0 1.9.7 3.1.7 1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.8-1.1-2.8-3.8ZM14.8 5.5c.6-.8 1.1-1.9 1-3-.9.1-2 .6-2.7 1.4-.6.7-1.2 1.8-1.1 2.8 1 .1 2.1-.5 2.8-1.2Z"/></svg> : provider.mark}</span>
      <span>{busy === provider.id ? 'Redirecting…' : `Continue with ${provider.name}`}</span>
      {enabled && !enabled[provider.id] && <small>Coming soon</small>}
    </button>)}</div>
    {!enabled && !error && <p role="status">Loading sign-in options…</p>}
    {error && <><p className="error-message" role="alert">{error}</p><button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button></>}
  </section>;
}
