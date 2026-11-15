import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/backend/auth-security';
import { requestAuthClient } from '@/lib/supabase/request';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const response = NextResponse.json({ success: true }, { headers });
    const { error } = await requestAuthClient(request, response).auth.signOut({ scope: 'local' });
    if (error) throw error;
    // Retire old custom-session cookies; they are never accepted by the new backend.
    response.cookies.set('tb_session', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
    response.cookies.set('tb_google_challenge', '', { httpOnly: true, sameSite: 'strict', path: '/api/auth/google', maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ error: 'Sign-out failed. Please try again.' }, { status: 503, headers }); }
}
