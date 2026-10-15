import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authConfig, safeAuthReturn, sameOrigin } from '@/lib/backend/auth-security';
import { requestAuthClient } from '@/lib/supabase/request';
import { resolveSupabaseAccount } from '@/lib/backend/supabase-account';

const schema = z.object({
  action: z.enum(['signin', 'signup']),
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
  next: z.string().max(2000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'signup' && value.password.length < 8) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use at least 8 characters.' });
});
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Please sign in from TravelBuddy.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SyntaxError();
    const text = await request.text();
    if (text.length > 5000) throw new SyntaxError();
    const { action, email, password, next } = schema.parse(JSON.parse(text));
    const response = NextResponse.json({}, { headers });
    const client = requestAuthClient(request, response);
    const callback = new URL('/auth/callback', authConfig().origin);
    callback.searchParams.set('next', safeAuthReturn(next));
    const { data, error } = action === 'signup'
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } })
      : await client.auth.signInWithPassword({ email, password });
    if (error) {
      if ((error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError') throw error;
      const rateLimited = error.status === 429;
      const message = rateLimited ? 'Too many attempts. Please wait and try again.'
        : action === 'signin' ? 'Email or password is incorrect, or your email needs confirmation.'
        : error.code === 'weak_password' ? 'Choose a stronger password with at least 8 characters.'
        : 'Your account could not be created. Try signing in if you already have an account.';
      return NextResponse.json({ error: message }, { status: rateLimited ? 429 : action === 'signin' ? 401 : 400, headers });
    }
    let result: NextResponse;
    if (!data.session) {
      result = NextResponse.json({ confirmationRequired: true, message: 'Check your email for a confirmation link, then sign in.' }, { headers });
    } else {
      const { data: verified, error: verificationError } = await client.auth.getUser();
      if (verificationError || !verified.user) throw new Error('Session verification failed');
      const account = await resolveSupabaseAccount(verified.user);
      if (account.data.status !== 'active') {
        await client.auth.signOut();
        result = NextResponse.json({ error: 'This account is unavailable. Contact support.' }, { status: 403, headers });
      } else {
        const target = safeAuthReturn(next);
        result = NextResponse.json({ redirect: account.data.onboarding === 'pending' ? `/register/complete?next=${encodeURIComponent(target)}` : target }, { headers });
      }
    }
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    for (const name of ['cache-control', 'expires', 'pragma']) {
      const value = response.headers.get(name); if (value) result.headers.set(name, value);
    }
    return result;
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? 'Enter a valid email and password. New passwords need at least 8 characters.' : 'Sign-in is temporarily unavailable. Please try again.' }, { status: invalid ? 400 : 503, headers });
  }
}
