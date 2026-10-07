"use client";
import { useState, type FormEvent } from 'react';
import { Brand } from './UI';
import { GoogleLogoutButton } from './GoogleLogoutButton';
import type { ServerAccount } from './ServerAuthProvider';

export function GoogleOnboarding({ account }: { account: ServerAccount }) {
  const [name, setName] = useState(account.displayName);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, acceptAccountCreation: accepted }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Your account could not be completed.');
      window.location.assign('/account/security');
    } catch (err) { setError(err instanceof Error ? err.message : 'Your account could not be completed.'); setBusy(false); }
  }
  return <div className="page-width standard-page google-account-page"><Brand /><h1>Welcome to TravelBuddy.</h1><p>Confirm your name to finish setting up your traveler account.</p><form className="settings-panel" onSubmit={submit}><label className="field">Your name<input autoComplete="name" maxLength={120} required value={name} onChange={event => setName(event.target.value)} /></label><label className="google-account-consent"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Create my TravelBuddy traveler account. Trips and bookings are still demonstrations stored on this device.</span></label>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary button-wide" disabled={busy}>{busy ? 'Saving your account…' : 'Complete registration'}</button></form><GoogleLogoutButton /></div>;
}
