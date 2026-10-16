import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cancelReservation } from '@/lib/backend/inventory';
import { BuddyError, buddyFailure, requireAccount } from '@/lib/backend/buddy-access';
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await requireAccount(request, true);
    if (!z.string().uuid().safeParse(params.id).success) throw new BuddyError('Booking not found.', 404);
    return NextResponse.json({ booking: await cancelReservation(account.id, params.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return buddyFailure(error); }
}
