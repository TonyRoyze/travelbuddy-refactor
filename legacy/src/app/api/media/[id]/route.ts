import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { documentDatabase } from '@/lib/backend/database';
import { sessionAccount } from '@/lib/backend/sessions';
import { mediaIsPublic, mediaStorage } from '@/lib/backend/media';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!z.string().uuid().safeParse(params.id).success) return new NextResponse(null, { status: 404, headers });
  try {
    const media = await documentDatabase().mediaAsset.findUnique({ where: { id: params.id } });
    if (!media) return new NextResponse(null, { status: 404, headers });
    if (!(await mediaIsPublic(media.id))) {
      const account = await sessionAccount(request);
      if (account?.id !== media.ownerId) {
        const entitled = account && await documentDatabase().scheduledBooking.findFirst({ where: { order: { travelerId: account.id }, OR: [
          { snapshot: { path: ['gallery'], array_contains: [`/api/media/${media.id}`] } },
          { snapshot: { path: ['videoIds'], array_contains: [media.id] } },
        ] }, select: { id: true } });
        if (!entitled) return new NextResponse(null, { status: 404, headers });
      }
    }
    const { data, error } = await mediaStorage().createSignedUrl(media.storagePath, 3600);
    if (error || !data) throw new Error('Media unavailable');
    return NextResponse.redirect(data.signedUrl, { status: 307, headers });
  } catch { return new NextResponse(null, { status: 503, headers }); }
}
