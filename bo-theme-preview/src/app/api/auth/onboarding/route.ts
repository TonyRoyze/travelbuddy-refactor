import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/backend/auth-security';
import { sessionAccount, publicAccount } from '@/lib/backend/sessions';
import { DocumentConflictError, updateAccount } from '@/lib/backend/account-commands';

const schema = z.object({ displayName: z.string().trim().min(1).max(120), acceptAccountCreation: z.literal(true), accountType: z.enum(['traveler', 'buddy']).default('traveler') }).strict();
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const account = await sessionAccount(request);
    if (!account) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid profile details.' }, { status: 400 });
    const text = await request.text();
    if (text.length > 2000) return NextResponse.json({ error: 'Invalid profile details.' }, { status: 400 });
    let body: z.infer<typeof schema>;
    try { body = schema.parse(JSON.parse(text)); } catch { return NextResponse.json({ error: 'Enter your name and confirm account creation.' }, { status: 400 }); }
    if (account.data.onboarding !== 'pending') return NextResponse.json({ error: 'Your registration is already complete.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    const updated = await updateAccount(account.id, account.revision, { ...account.data, displayName: body.displayName, roles: [body.accountType === 'buddy' ? 'provider' : 'traveler'], onboarding: 'completed' });
    return NextResponse.json({ account: publicAccount(updated) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DocumentConflictError ? 'Your profile changed. Reload and try again.' : 'Your profile could not be saved. Please try again.' }, { status: error instanceof DocumentConflictError ? 409 : 503 });
  }
}
