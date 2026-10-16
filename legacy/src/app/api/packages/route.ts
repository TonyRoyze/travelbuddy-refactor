import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { packageSearchParamsSchema, searchPackages } from '@/lib/backend/packages';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const filters = packageSearchParamsSchema.parse({
      date: params.get('date') ?? undefined, live: params.get('live') ?? undefined,
      q: params.get('q') ?? undefined,
      destination: params.get('destination') ?? undefined,
      category: params.get('category') ?? undefined,
      minPrice: params.get('minPrice') ?? undefined,
      maxPrice: params.get('maxPrice') ?? undefined,
      duration: params.get('duration') ?? undefined,
      freeCancellation: params.get('freeCancellation') ?? undefined,
      sort: params.get('sort') ?? undefined,
      page: params.get('page') ?? undefined,
      pageSize: params.get('pageSize') ?? undefined,
    });
    const result = await searchPackages({
      ...filters,
      freeCancellation: filters.freeCancellation === 'true',
      live: filters.live === 'true',
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Check the package search filters and try again.' }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: 'Packages are temporarily unavailable.' }, { status: 503, headers: noStore });
  }
}
