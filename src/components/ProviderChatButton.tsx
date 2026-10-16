'use client';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

export function ProviderChatButton({ packageId, bookingQuery = '', className = 'button button-secondary button-wide' }: { packageId: string; bookingQuery?: string; className?: string }) {
  const query = new URLSearchParams({ package: packageId });
  if (bookingQuery) query.set('booking', bookingQuery);
  return <Link className={className} href={`/inbox?${query}`}><MessageCircle size={17}/>Chat with provider</Link>;
}
