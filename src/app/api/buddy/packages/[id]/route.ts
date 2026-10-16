import { NextRequest, NextResponse } from 'next/server';
import { BuddyError, buddyFailure, readBuddyJson, requireBuddy } from '@/lib/backend/buddy-access';
import { editorPackage, saveBuddyPackage } from '@/lib/backend/buddy-packages';
import { documentDatabase } from '@/lib/backend/database';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await requireBuddy(request);
    const row = await documentDatabase().experiencePackage.findFirst({ where: { id: params.id, ownerId: account.id } });
    if (!row) throw new BuddyError('Package not found.', 404);
    return NextResponse.json({ package: editorPackage(row) }, { headers });
  } catch (error) { return buddyFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await requireBuddy(request, true);
    return NextResponse.json({ package: await saveBuddyPackage(account.id, account.data.displayName, await readBuddyJson(request), params.id) }, { headers });
  } catch (error) { return buddyFailure(error); }
}
