import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { resolveGoogleAccount } from '@/lib/backend/google-account';
import { createSession, revokeSession } from '@/lib/backend/sessions';
import { authConfig, CHALLENGE_COOKIE, CHALLENGE_SECONDS, createChallenge, sameOrigin, SESSION_COOKIE, SESSION_SECONDS, verifiedGoogleProfile, verifyChallenge } from '@/lib/backend/auth-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const verifier = new OAuth2Client();
const bodySchema = z.object({ credential: z.string().min(1).max(16000), csrf: z.string().length(43) }).strict();

export async function GET() {
  try {
    const config = authConfig();
    const challenge = createChallenge();
    const response = NextResponse.json({ clientId: config.clientId, nonce: challenge.nonce, csrf: challenge.csrf }, { headers });
    response.cookies.set(CHALLENGE_COOKIE, challenge.cookie, { httpOnly: true, secure: config.secure, sameSite: 'strict', path: '/api/auth/google', maxAge: CHALLENGE_SECONDS });
    return response;
  } catch {
    return NextResponse.json({ error: 'Google sign-in is not configured yet.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  let config: ReturnType<typeof authConfig>;
  try { config = authConfig(); } catch { return NextResponse.json({ error: 'Google sign-in is not configured yet.' }, { status: 503, headers }); }
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Please sign in from TravelBuddy.' }, { status: 403, headers });
  let profile: ReturnType<typeof verifiedGoogleProfile>;
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid content type');
    const text = await request.text();
    if (text.length > 18000) throw new Error('Request too large');
    const body = bodySchema.parse(JSON.parse(text));
    const challenge = verifyChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value || '', body.csrf);
    const ticket = await verifier.verifyIdToken({ idToken: body.credential, audience: config.clientId });
    profile = verifiedGoogleProfile(ticket.getPayload(), challenge.nonce);
  } catch {
    return NextResponse.json({ error: 'Google sign-in could not be verified. Please try again.' }, { status: 401, headers });
  }
  try {
    const account = await resolveGoogleAccount(profile);
    if (account.data.status !== 'active') return NextResponse.json({ error: 'This account is unavailable. Contact support.' }, { status: 403, headers });
    const token = await createSession(account.id);
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ redirect: account.data.onboarding === 'pending' ? '/register/google' : '/account/security' }, { headers });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
    response.cookies.set(CHALLENGE_COOKIE, '', { httpOnly: true, secure: config.secure, sameSite: 'strict', path: '/api/auth/google', maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, { status: 503, headers });
  }
}
