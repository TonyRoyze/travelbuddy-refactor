import { NextResponse } from 'next/server';
import { documentDatabase } from '@/lib/backend/database';
import { accountDataSchema } from '@/lib/backend/documents';
import { packageDataSchema } from '@/lib/backend/packages';
import { BuddyError, buddyFailure } from '@/lib/backend/buddy-access';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const row = await documentDatabase().experiencePackage.findUnique({ where: { id: params.id }, include: { owner: true } });
    const owner = row?.owner ? accountDataSchema.parse(row.owner.data) : null;
    if (!row?.published || (row.ownerId && owner?.status !== 'active')) throw new BuddyError('This experience is no longer available.', 404);
    const chatAvailable = Boolean(owner && owner.onboarding === 'completed' && owner.roles.some(role => role === 'provider' || role === 'guide'));
    return NextResponse.json({ experience: packageDataSchema.parse(row.data), chatAvailable, providerId: chatAvailable ? row.ownerId : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return buddyFailure(error); }
}
