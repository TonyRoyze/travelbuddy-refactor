import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { suggestPackages } from '@/lib/backend/packages';

export const dynamic = 'force-dynamic';
const querySchema = z.string().trim().min(2).max(80);

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get('q'));
  if (!parsed.success) return NextResponse.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const suggestions = await suggestPackages(parsed.data);
    return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Suggestions are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
