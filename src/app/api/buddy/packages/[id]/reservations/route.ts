import { NextRequest, NextResponse } from 'next/server';
import { documentDatabase } from '@/lib/backend/database';
import { BuddyError, buddyFailure, requireBuddy } from '@/lib/backend/buddy-access';
import { today } from '@/lib/customer';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await requireBuddy(request); const db = documentDatabase();
    if (!await db.experiencePackage.findFirst({ where: { id: params.id, ownerId: account.id }, select: { id: true } })) throw new BuddyError('Package not found.', 404);
    const rows = await db.scheduledBooking.groupBy({ by: ['date', 'time', 'optionIndex'], where: { packageId: params.id, date: { gte: new Date(today() + 'T00:00:00Z') }, status: 'confirmed' }, _sum: { travelers: true }, orderBy: [{ date: 'asc' }, { time: 'asc' }], take: 1000 });
    return NextResponse.json({ reservations: rows.map(row => ({ date: row.date.toISOString().slice(0, 10), time: row.time, option: row.optionIndex, travelers: row._sum.travelers ?? 0 })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return buddyFailure(error); }
}
