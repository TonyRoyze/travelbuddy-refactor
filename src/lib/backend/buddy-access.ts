import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount } from './sessions';
import { sameOrigin } from './auth-security';

export class BuddyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function requireAccount(request: NextRequest, mutation = false) {
  if (mutation && !sameOrigin(request)) throw new BuddyError('Open this page in TravelBuddy and try again.', 403);
  const account = await sessionAccount(request);
  if (!account) throw new BuddyError('Sign in to continue.', 401);
  if (account.data.onboarding !== 'completed') throw new BuddyError('Complete registration first.', 403);
  return account;
}
export async function requireBuddy(request: NextRequest, mutation = false) {
  if (mutation && !sameOrigin(request)) throw new BuddyError('Open this page in TravelBuddy and try again.', 403);
  const account = await sessionAccount(request);
  if (!account) throw new BuddyError('Sign in to continue.', 401);
  if (account.data.onboarding !== 'completed' || !account.data.roles.includes('provider')) throw new BuddyError('A buddy account is required.', 403);
  return account;
}
export function buddyFailure(error: unknown) {
  if (!(error instanceof BuddyError)) console.error('Backend operation failed:', error instanceof Error ? error.message : 'Unknown error');
  return NextResponse.json({ error: error instanceof BuddyError ? error.message : 'Your changes could not be saved. Please try again.' }, {
    status: error instanceof BuddyError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' },
  });
}
export async function readBuddyJson(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BuddyError('Send valid package details.', 400);
  // Read incrementally so chunked requests cannot bypass the limit.
  const reader = request.body?.getReader();
  if (!reader) throw new BuddyError('Missing details.', 400);
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 50000) { await reader.cancel(); throw new BuddyError('These details are too long.', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new BuddyError('Send valid details.', 400); }
}
