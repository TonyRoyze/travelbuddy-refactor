import { NextRequest, NextResponse } from 'next/server';
import { authConfig, safeAuthReturn } from '@/lib/backend/auth-security';
import { requestAuthClient } from '@/lib/supabase/request';
import { resolveSupabaseAccount } from '@/lib/backend/supabase-account';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const origin = authConfig().origin;
  const response = NextResponse.redirect(new URL('/login?error=signin', origin));
  response.headers.set('Cache-Control', 'private, no-store');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || request.nextUrl.searchParams.has('error')) return response;
  try {
    const client = requestAuthClient(request, response);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return response;
    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user) return response;
    const account = await resolveSupabaseAccount(data.user);
    if (account.data.status !== 'active') {
      await client.auth.signOut();
      return response;
    }
    const next = safeAuthReturn(request.nextUrl.searchParams.get('next'));
    const target = account.data.onboarding === 'pending' ? `/register/complete?next=${encodeURIComponent(next)}` : next;
    response.headers.set('Location', new URL(target, origin).toString());
    return response;
  } catch { return response; }
}
