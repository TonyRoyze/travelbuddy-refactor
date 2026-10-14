import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { testAccountsEnabled, seedTestAccounts, TEST_BUDDY_ID, TEST_TRAVELER_ID } from '@/lib/backend/test-accounts';
import { sameOrigin } from '@/lib/backend/auth-security';
import { documentDatabase } from '@/lib/backend/database';
import { adminAuthClient } from '@/lib/supabase/admin';
import { requestAuthClient } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!testAccountsEnabled() || !['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers });
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SyntaxError();
    const text = await request.text(); if (text.length > 1000) throw new SyntaxError();
    const { role } = z.object({ role: z.enum(['buddy', 'traveler']) }).strict().parse(JSON.parse(text));
    await seedTestAccounts();
    const db = documentDatabase();
    const account = await db.accountDocument.findUniqueOrThrow({ where: { id: role === 'buddy' ? TEST_BUDDY_ID : TEST_TRAVELER_ID } });
    const admin = adminAuthClient();
    const password = randomBytes(32).toString('base64url');
    const email = `travelbuddy-dev-${role}@example.test`;
    if (account.supabaseUserId) {
      const { error } = await admin.auth.admin.updateUserById(account.supabaseUserId, { password });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error || new Error('User creation failed');
      await db.accountDocument.update({ where: { id: account.id }, data: { supabaseUserId: data.user.id } });
    }
    const response = NextResponse.json({ redirect: role === 'buddy' ? '/inbox' : '/inbox?tab=replies' }, { headers });
    const { error } = await requestAuthClient(request, response).auth.signInWithPassword({ email, password });
    if (error) throw error;
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? 'Choose a test buddy or traveller.' : 'The test account could not be opened.' }, { status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503, headers });
  }
}
