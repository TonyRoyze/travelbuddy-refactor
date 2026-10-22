import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dateSchema } from '@/lib/availability';
import { today } from '@/lib/customer';
import { packageAvailability } from '@/lib/backend/inventory';
import { BuddyError, buddyFailure } from '@/lib/backend/buddy-access';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const parsed = z.object({ date: dateSchema, option: z.coerce.number().int().min(0).max(7), travelers: z.coerce.number().int().min(1).max(12) }).safeParse({ date: request.nextUrl.searchParams.get('date') ?? today(), option: request.nextUrl.searchParams.get('option') ?? 0, travelers: request.nextUrl.searchParams.get('travelers') ?? 1 });
    if (!parsed.success) throw new BuddyError('Choose a valid date, option and traveler count.', 400);
    return NextResponse.json(await packageAvailability(params.id, parsed.data.date, parsed.data.option, parsed.data.travelers), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return buddyFailure(error); }
}
