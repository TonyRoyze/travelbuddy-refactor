import { NextRequest, NextResponse } from 'next/server';
import { buddyFailure, readBuddyJson, requireBuddy } from '@/lib/backend/buddy-access';
import { editorPackage, saveBuddyPackage } from '@/lib/backend/buddy-packages';
import { documentDatabase } from '@/lib/backend/database';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const account = await requireBuddy(request);
    const rows = await documentDatabase().experiencePackage.findMany({ where: { ownerId: account.id }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 100 });
    return NextResponse.json({ packages: rows.map(editorPackage) }, { headers });
  } catch (error) { return buddyFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const account = await requireBuddy(request, true);
    return NextResponse.json({ package: await saveBuddyPackage(account.id, account.data.displayName, await readBuddyJson(request)) }, { status: 201, headers });
  } catch (error) { return buddyFailure(error); }
}
