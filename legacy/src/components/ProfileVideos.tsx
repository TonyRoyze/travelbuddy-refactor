'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MediaPicker } from './MediaPicker';
import { useServerAuth } from './ServerAuthProvider';
export function ProfileVideos() {
  const { account, refresh } = useServerAuth();
  const [ids, setIds] = useState<string[]>(account?.profileVideoIds ?? []);
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { setIds(account?.profileVideoIds ?? []); }, [account]);
  if (!account?.roles.includes('provider')) return null;
  async function save() {
    if (!account) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/account/videos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoIds: ids, revision: account.revision }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      await refresh(); setMessage('Your profile clips are saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Your clips could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-panel profile-clips"><div className="profile-section-heading"><div><h2>Meet your buddy, on video.</h2><p>Introduce yourself or share a glimpse of the places you know. Saved clips appear on your public buddy profile.</p></div></div>
    <MediaPicker kind="video" ids={ids} onChange={setIds} onBusyChange={setUploading} disabled={busy} />
    <div className="buddy-form-actions"><Link href={`/buddy/${account.id}`} className="text-link">View public profile</Link><button className="button button-primary" type="button" onClick={() => void save()} disabled={busy || uploading}>{busy ? 'Saving clips…' : 'Save profile clips'}</button></div>
    {message && <p role="status" className="inline-note">{message}</p>}
  </section>;
}
