import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BuddyError, buddyFailure, readBuddyJson, requireBuddy } from '@/lib/backend/buddy-access';
import { DocumentConflictError, updateAccount } from '@/lib/backend/account-commands';
import { requireOwnedMedia } from '@/lib/backend/media';
const schema = z.object({ videoIds: z.array(z.string().uuid()).max(3), revision: z.number().int().positive() }).strict();
export async function PATCH(request: NextRequest) {
  try {
    const account = await requireBuddy(request, true);
    const parsed = schema.safeParse(await readBuddyJson(request));
    if (!parsed.success) throw new BuddyError('Choose up to three video clips.', 400);
    await requireOwnedMedia(account.id, parsed.data.videoIds, 'video');
    const updated = await updateAccount(account.id, parsed.data.revision, { ...account.data, profileVideoIds: parsed.data.videoIds });
    return NextResponse.json({ revision: updated.revision }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return buddyFailure(error instanceof DocumentConflictError ? new BuddyError('Your profile changed. Reload before saving.', 409) : error); }
}
