import { NextRequest, NextResponse } from 'next/server';
import { publicAccount, sessionAccount } from '@/lib/backend/sessions';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const account = await sessionAccount(request);
    return NextResponse.json({ account: account ? publicAccount(account) : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Your session could not be checked.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
