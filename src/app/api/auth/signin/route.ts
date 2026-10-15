import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authConfig, safeAuthReturn, sameOrigin, socialProviders } from '@/lib/backend/auth-security';
import { requestAuthClient } from '@/lib/supabase/request';
import { GET as providersGET } from '../providers/route';
const schema = z.object({ provider: z.enum(socialProviders), next: z.string().max(2000).optional() }).strict();
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Please sign in from TravelBuddy.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SyntaxError();
    const text = await request.text();
    if (text.length > 2500) throw new SyntaxError();
    const { provider, next } = schema.parse(JSON.parse(text));
    const available = await providersGET();
    if (!available.ok) return available;
    const settings = await available.json();
    if (!settings.providers[provider]) return NextResponse.json({ error: 'This sign-in option is not available yet.' }, { status: 409, headers });
    const response = NextResponse.json({ url: '' }, { headers });
    const callback = new URL('/auth/callback', authConfig().origin);
    callback.searchParams.set('next', safeAuthReturn(next));
    const { data, error } = await requestAuthClient(request, response).auth.signInWithOAuth({ provider, options: { redirectTo: callback.toString(), skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error('Unable to start sign-in');
    const result = NextResponse.json({ url: data.url }, { headers });
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = response.headers.get(name); if (value) result.headers.set(name, value);
    }
    return result;
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? 'Choose a valid sign-in option.' : 'Sign-in is temporarily unavailable. Please try again.' }, { status: invalid ? 400 : 503, headers });
  }
}
