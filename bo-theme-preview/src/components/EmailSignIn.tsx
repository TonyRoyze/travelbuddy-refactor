'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { useCustomer } from './CustomerProvider';

export function EmailSignIn({ registration = false, next = '/account/security' }: { registration?: boolean; next?: string }) {
  const { logout: logoutDemo } = useCustomer();
  const formId = useId();
  const emailInput = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: registration ? 'signup' : 'signin', email, password, next }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Please try again.');
      setPassword('');
      if (body.confirmationRequired) { setMessage(body.message); setBusy(false); return; }
      logoutDemo();
      window.location.assign(body.redirect);
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); setBusy(false); }
  }
  return <section className="email-auth-option">
    <button type="button" className="social-sign-in-button" aria-expanded={expanded} aria-controls={formId} disabled={busy} onClick={() => {
      setExpanded(value => !value);
      if (!expanded) requestAnimationFrame(() => emailInput.current?.focus());
      else { setPassword(''); setVisible(false); }
    }}><Mail size={22} aria-hidden="true"/><span>Continue with email</span></button>
    <form id={formId} hidden={!expanded} className="email-auth-form" onSubmit={submit} aria-label={registration ? 'Register with email' : 'Sign in with email'} aria-busy={busy}>
    <label className="field">Email address<input ref={emailInput} type="email" name="email" autoComplete="email" required maxLength={320} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>
    <label className="field">Password<span className="email-password-field"><input type={visible ? 'text' : 'password'} name="password" autoComplete={registration ? 'new-password' : 'current-password'} required minLength={registration ? 8 : 1} maxLength={1024} value={password} disabled={busy} aria-describedby={registration ? 'email-password-help' : undefined} onChange={event => setPassword(event.target.value)} /><button type="button" className="email-password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
    {registration && <p id="email-password-help" className="email-password-help">Use at least 8 characters. You’ll choose Traveller or Buddy next.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="inline-note" role="status">{message}</p>}
    <button type="submit" className="button button-primary button-wide" disabled={busy}>{busy ? (registration ? 'Creating your account…' : 'Signing in…') : registration ? 'Create account with email' : 'Sign in with email'}</button>
    </form>
  </section>;
}
