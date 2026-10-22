import { NextRequest, NextResponse } from 'next/server';
import { buddyFailure, requireBuddy } from '@/lib/backend/buddy-access';
import { readUpload, saveMedia } from '@/lib/backend/media';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const account = await requireBuddy(request, true);
    const media = await saveMedia(account.id, await readUpload(request));
    return NextResponse.json({ media: { id: media.id, mimeType: media.mimeType, durationSeconds: media.durationSeconds } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return buddyFailure(error); }
}
