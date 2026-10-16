import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { MapPin, MessageCircle } from 'lucide-react';
import { documentDatabase } from '@/lib/backend/database';
import { accountDataSchema } from '@/lib/backend/documents';
import { packageDataSchema } from '@/lib/backend/packages';
import { money } from '@/lib/customer';
import { Back } from '@/components/UI';
import { Avatar } from '@/components/ProfilePhoto';
import { VideoClips } from '@/components/BuddyListing';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const db = documentDatabase();
  const row = await db.accountDocument.findUnique({ where: { id: params.id } });
  if (!row) notFound();
  const account = accountDataSchema.parse(row.data);
  if (account.status !== 'active' || account.onboarding !== 'completed' || !account.roles.includes('provider')) notFound();
  const packages = await db.experiencePackage.findMany({ where: { ownerId: row.id, published: true }, orderBy: { updatedAt: 'desc' }, take: 100 });
  const details = account.profileDetails;
  return <div className="page-width standard-page public-buddy-profile"><Back href="/nearby" label="Explore experiences" /><div className="public-buddy-intro"><Avatar name={account.displayName} mediaId={account.avatarMediaId} /><div><p className="eyebrow">Your local buddy</p><h1>{account.displayName}</h1><div className="public-buddy-facts">{details.homeBase && <span><MapPin size={18} />{details.homeBase}</span>}{details.languages && <span><MessageCircle size={18} />{details.languages}</span>}</div></div></div>
    {details.bio && <p className="public-buddy-bio preserve-lines">{details.bio}</p>}{details.specialties && <p><strong>Local specialties:</strong> {details.specialties}</p>}{details.yearsExperience !== null && <p>{details.yearsExperience} years of local experience</p>}
    <VideoClips ids={account.profileVideoIds} title={`Meet ${account.displayName}, on video.`} />
    <section className="public-buddy-packages"><h2>Explore with {account.displayName}</h2>{packages.length ? <div className="buddy-package-grid">{packages.map(row => { const item = packageDataSchema.parse(row.data); return <article key={row.id} className="buddy-package-card"><Link className="buddy-package-cover" href={`/experience/${row.id}`}><img src={item.image} alt={item.title} /></Link><div className="buddy-package-card-body"><p>{item.destination} · {item.duration}</p><h3><Link href={`/experience/${row.id}`}>{item.title}</Link></h3><strong>From {money(item.price)} / person</strong></div></article>; })}</div> : <p>New experiences are on the way. Check back soon.</p>}</section>
  </div>;
}
