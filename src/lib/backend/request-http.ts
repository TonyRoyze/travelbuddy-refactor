import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin, SESSION_COOKIE } from './auth-security';
import { sessionAccount } from './sessions';
import { RequestAccessError } from './request-commands';

export const requestHeaders = { 'Cache-Control': 'no-store' };
export async function requestAccount(request: NextRequest, write = false) {
  if (write && !sameOrigin(request)) throw new RequestAccessError(403, 'Invalid request origin.');
  const account = await sessionAccount(request.cookies.get(SESSION_COOKIE)?.value);
  if (!account) return null;
  if (account.data.onboarding !== 'completed') throw new RequestAccessError(403, 'Complete your account to use the inbox.');
  return account;
}
export async function requestBody(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SyntaxError();
  const text = await request.text();
  if (text.length > 16000) throw new SyntaxError();
  return JSON.parse(text) as unknown;
}
export function requestError(error: unknown) {
  const status = error instanceof RequestAccessError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
  const message = error instanceof RequestAccessError ? error.message : status === 400 ? 'Check the request details and try again.' : 'Your inbox is temporarily unavailable. Please try again.';
  return NextResponse.json({ error: message }, { status, headers: requestHeaders });
}
export function requestSignIn() {
  return NextResponse.json({ error: 'Sign in to use the inbox.' }, { status: 401, headers: requestHeaders });
}
