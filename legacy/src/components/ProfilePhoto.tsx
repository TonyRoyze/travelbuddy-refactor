'use client';
import { useId, useState } from 'react';
import { Camera } from 'lucide-react';
import { mediaUrl } from '@/lib/package-editor';
import { useServerAuth } from './ServerAuthProvider';
export function Avatar({ name, mediaId }: { name: string; mediaId?: string | null }) {
  return <div className="account-avatar">{mediaId ? <img src={mediaUrl(mediaId)} alt={`${name}'s profile photo`} /> : name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div>;
}
export function ProfilePhoto() {
  const { account, refresh } = useServerAuth(); const id = useId();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  if (!account) return null;
  async function change(file?: File) {
    setMessage('');
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setMessage('Choose a JPEG, PNG or WebP photo up to 5 MB.'); return; }
    setBusy(true);
    try {
      const form = new FormData(); if (file) form.set('file', file);
      const response = await fetch('/api/account/photo', { method: file ? 'POST' : 'DELETE', ...(file ? { body: form } : {}) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      await refresh(); setMessage(file ? 'Your profile photo is saved.' : 'Your profile photo is removed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Your photo could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-panel profile-photo-panel"><div><h2>Your profile photo</h2><p>Choose a photo that makes it easy to recognise you.</p><small>JPEG, PNG or WebP · up to 5 MB</small></div><div className="profile-photo-actions"><Avatar name={account.displayName} mediaId={account.avatarMediaId} /><label className="button button-secondary" htmlFor={id}><Camera size={18} />{busy ? 'Saving photo…' : account.avatarMediaId ? 'Replace photo' : 'Upload photo'}<input className="sr-only" id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void change(file); }} /></label>{account.avatarMediaId && <button className="text-link" type="button" disabled={busy} onClick={() => void change()}>Remove photo</button>}</div>{message && <p role="status" className="inline-note">{message}</p>}</section>;
}
