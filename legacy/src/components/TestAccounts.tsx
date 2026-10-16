'use client';
import { useState } from 'react';
import { Car, MapPin, Package, UserRound } from 'lucide-react';
import { PageHeading } from './UI';

export function TestAccounts() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function open(role: 'buddy' | 'traveler') {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/dev/test-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      window.location.assign(body.redirect);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Try again.'); setBusy(false); }
  }
  return <div className="page-width standard-page"><PageHeading title="Try the inbox together" text="Switch between a buddy and a traveller to test requests, private replies and custom packages."/><div className="test-account-grid"><article className="test-account-card"><span className="provider-avatar">R</span><h2>Ravi</h2><p>Test buddy · Ella</p><ul><li><MapPin size={18}/>Find nearby traveller requests</li><li><Package size={18}/>Send a custom package and total price</li><li><Car size={18}/>Include your vehicle details</li></ul><button disabled={busy} className="button button-primary" onClick={() => void open('buddy')}>Open test buddy account</button></article><article className="test-account-card"><span className="provider-avatar">M</span><h2>Maya</h2><p>Test traveller · Ella</p><ul><li><MapPin size={18}/>Post your plan and pickup point</li><li><Package size={18}/>View packages from buddies</li><li><UserRound size={18}/>Reply privately to each buddy</li></ul><button disabled={busy} className="button button-secondary" onClick={() => void open('traveler')}>Open test traveller account</button></article></div>{error && <p className="error-message" role="alert">{error}</p>}<p className="test-account-note">A sample request at Ella railway station is ready to try. Test accounts share saved posts and messages on this development database.</p></div>;
}
