import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, publicAccount } from '@/lib/backend/sessions';
import { sameOrigin } from '@/lib/backend/auth-security';
import { BuddyError, buddyFailure } from '@/lib/backend/buddy-access';
import { DocumentConflictError, updateAccount } from '@/lib/backend/account-commands';
import { readUpload, saveMedia } from '@/lib/backend/media';
export const runtime = 'nodejs';
async function accountForPhoto(request: NextRequest) {
  if (!sameOrigin(request)) throw new BuddyError('Open your profile in TravelBuddy and try again.', 403);
  const account = await sessionAccount(request);
  if (!account) throw new BuddyError('Sign in to continue.', 401);
  if (account.data.onboarding !== 'completed') throw new BuddyError('Complete registration first.', 403);
  return account;
}
export async function POST(request: NextRequest) {
  try {
    const account = await accountForPhoto(request);
    const file = await readUpload(request);
    if (!file.type.startsWith('image/')) throw new BuddyError('Choose a JPEG, PNG or WebP photo.', 400);
    if (file.size > 5 * 1024 * 1024) throw new BuddyError('Profile photos must be 5 MB or smaller.', 413);
    const media = await saveMedia(account.id, file);
    const updated = await updateAccount(account.id, account.revision, { ...account.data, avatarMediaId: media.id });
    return NextResponse.json({ account: publicAccount({ ...updated, email: account.email }) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return buddyFailure(error instanceof DocumentConflictError ? new BuddyError('Your profile changed. Reload before uploading again.', 409) : error); }
}
export async function DELETE(request: NextRequest) {
  try {
    const account = await accountForPhoto(request);
    await updateAccount(account.id, account.revision, { ...account.data, avatarMediaId: null });
    return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return buddyFailure(error instanceof DocumentConflictError ? new BuddyError('Your profile changed. Reload and try again.', 409) : error); }
}
