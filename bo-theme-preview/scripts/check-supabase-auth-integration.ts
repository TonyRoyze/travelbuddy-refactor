import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { createAuthTestUser } from './auth-test-user';
import { documentDatabase } from '../src/lib/backend/database';
import { GET as session } from '../src/app/api/auth/session/route';
import { POST as onboarding } from '../src/app/api/auth/onboarding/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.DOCUMENT_TEST_DATABASE_URL;
  if (!url || url === process.env.DOCUMENT_DATABASE_URL) throw new Error('Set DOCUMENT_TEST_DATABASE_URL to a separate migrated test database.');
  process.env.DOCUMENT_DATABASE_URL = url;
  const db = documentDatabase();
  const auth = await createAuthTestUser('Auth integration');
  const origin = new URL(process.env.AUTH_APP_URL!).origin;
  function request(path: string, method = 'GET', cookie = auth.cookie, body?: unknown, requestOrigin = origin) {
    return new NextRequest(origin + path, { method, headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  try {
    const first = await session(request('/api/auth/session'));
    assert.equal(first.status, 200);
    const account = (await first.json()).account;
    assert.ok(account?.id); assert.deepEqual(account.roles, ['traveler']); assert.equal(account.onboarding, 'pending');
    assert.equal((await (await session(request('/api/auth/session'))).json()).account.id, account.id, 'Reload reuses the same account');
    const invalid = request('/api/auth/session', 'GET', `tb_supabase=base64-${Buffer.from(JSON.stringify({ access_token: 'forged-token', refresh_token: 'forged-token', expires_at: 9999999999 })).toString('base64url')}`);
    assert.equal((await (await session(invalid)).json()).account, null);
    assert.equal((await onboarding(request('/api/auth/onboarding', 'POST', auth.cookie, { displayName: 'Maya', acceptAccountCreation: true }, 'https://evil.example'))).status, 403);
    assert.equal((await onboarding(request('/api/auth/onboarding', 'POST', auth.cookie, { displayName: 'Maya', acceptAccountCreation: true, roles: ['admin'] }))).status, 400);
    assert.equal((await onboarding(request('/api/auth/onboarding', 'POST', auth.cookie, { displayName: 'Maya', acceptAccountCreation: true }))).status, 200);
    const saved = await db.accountDocument.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal((saved.data as { onboarding: string }).onboarding, 'completed');
    await db.accountDocument.update({ where: { id: account.id }, data: { data: { ...(saved.data as object), status: 'suspended' } } });
    assert.equal((await (await session(request('/api/auth/session'))).json()).account, null, 'Suspended accounts cannot authenticate');
    await db.accountDocument.update({ where: { id: account.id }, data: { data: saved.data! } });
    const signedOut = await logout(request('/api/auth/logout', 'POST'));
    assert.equal(signedOut.status, 200);
    assert.ok(signedOut.cookies.getAll().some(cookie => cookie.name.startsWith('tb_supabase') && cookie.value === ''));
    assert.equal((await (await session(request('/api/auth/session', 'GET', ''))).json()).account, null);
    console.log('Supabase Auth integration passed: verified users, reload, tampered cookies, default roles, onboarding, suspended accounts, and sign-out.');
  } finally {
    await db.accountDocument.deleteMany({ where: { supabaseUserId: auth.user.id } });
    await auth.remove(); await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Auth integration failed'); process.exitCode = 1; });
