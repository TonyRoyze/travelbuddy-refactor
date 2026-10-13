import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { testAccountsEnabled, seedTestAccounts, TEST_BUDDY_ID, TEST_TRAVELER_ID } from '@/lib/backend/test-accounts';
import { authConfig, sameOrigin, SESSION_COOKIE, SESSION_SECONDS } from '@/lib/backend/auth-security';
import { createSession, revokeSession } from '@/lib/backend/sessions';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  // Development only, explicitly enabled and bound to the isolated test database.
  if (!testAccountsEnabled() || !['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SyntaxError();
    const text = await request.text(); if (text.length > 1000) throw new SyntaxError();
    const { role } = z.object({ role: z.enum(['buddy', 'traveler']) }).strict().parse(JSON.parse(text));
    await seedTestAccounts();
    const token = await createSession(role === 'buddy' ? TEST_BUDDY_ID : TEST_TRAVELER_ID);
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ redirect: role === 'buddy' ? '/inbox' : '/inbox?tab=replies' }, { headers });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: authConfig().secure, sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? 'Choose a test buddy or traveller.' : 'The test account could not be opened.' }, { status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503, headers });
  }
}
