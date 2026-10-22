'use client';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useServerAuth } from './ServerAuthProvider';

export function ProviderChatButton({ packageId, bookingQuery = '', className = 'button button-secondary button-wide' }: { packageId: string; bookingQuery?: string; className?: string }) {
  const { account } = useServerAuth();
  const [provider, setProvider] = useState<{ packageId: string; available: boolean; id: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/packages/${encodeURIComponent(packageId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(body => { if (!controller.signal.aborted) setProvider({ packageId, available: body.chatAvailable, id: body.providerId }); })
      .catch(() => { if (!controller.signal.aborted) setProvider({ packageId, available: false, id: null }); });
    return () => controller.abort();
  }, [packageId]);
  const loaded = provider?.packageId === packageId;
  const own = loaded && Boolean(account && provider.id === account.id);
  if (!loaded || !provider.available || own) return <button type="button" className={className} disabled><MessageCircle size={17}/>{!loaded ? 'Checking provider…' : own ? 'This is your package' : 'Provider chat unavailable'}</button>;
  const query = new URLSearchParams({ package: packageId });
  if (bookingQuery) query.set('booking', bookingQuery);
  return <Link className={className} href={`/inbox?${query}`}><MessageCircle size={17}/>Chat with provider</Link>;
}
