import { NextRequest, NextResponse } from 'next/server';
import { authConfig, sameOrigin, SESSION_COOKIE } from '@/lib/backend/auth-security';
import { revokeSession } from '@/lib/backend/sessions';
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: authConfig().secure, sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Sign-out failed. Please try again.' }, { status: 503 });
  }
}
