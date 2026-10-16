import { NextRequest, NextResponse } from 'next/server';
import { BuddyError, buddyFailure, readBuddyJson, requireAccount } from '@/lib/backend/buddy-access';
import { checkoutSchema, reserveBookings, travelerBookings } from '@/lib/backend/inventory';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try { const account = await requireAccount(request); return NextResponse.json({ bookings: await travelerBookings(account.id) }, { headers }); }
  catch (error) { return buddyFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const account = await requireAccount(request, true);
    const parsed = checkoutSchema.safeParse(await readBuddyJson(request));
    if (!parsed.success) throw new BuddyError('Check your dates, times, traveler details and cart, then try again.', 400);
    return NextResponse.json({ bookings: await reserveBookings(account.id, parsed.data) }, { status: 201, headers });
  } catch (error) { return buddyFailure(error); }
}
