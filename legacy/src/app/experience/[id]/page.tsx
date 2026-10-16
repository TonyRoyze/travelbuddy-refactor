import { notFound } from 'next/navigation';
import { getExperience } from '@/lib/catalog';
import { ExperiencePage } from '@/components/ExperienceDetails';
import { BuddyListing } from '@/components/BuddyListing';
import { documentDatabase } from '@/lib/backend/database';
import { packageDataSchema } from '@/lib/backend/packages';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: { id: string } }) {
  const row = await documentDatabase().experiencePackage.findFirst({ where: { id: params.id, published: true, OR: [{ ownerId: null }, { owner: { data: { path: ['status'], equals: 'active' } } }] } });
  if (!row) notFound();
  const experience = packageDataSchema.parse(row.data);
  if (!row.ownerId) return <ExperiencePage key={row.id} id={row.id} initialExperience={experience} />;
  return <BuddyListing experience={experience} videoIds={experience.videoIds ?? []} ownerId={row.ownerId} />;
}
