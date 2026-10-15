import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { adminAuthClient } from '../src/lib/supabase/admin';
import { documentDatabase } from '../src/lib/backend/database';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());

async function main() {
  const origin = process.env.AUTH_APP_URL!;
  for (const value of [origin, process.env.SUPABASE_URL!]) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error('Email HTTP checks require local app and Supabase instances.');
  }
  const email = `tb-email-${randomBytes(12).toString('hex')}@example.com`;
  const password = randomBytes(24).toString('base64url');
  const admin = adminAuthClient(); const db = documentDatabase();
  let cookie = ''; let userId: string | undefined;
  async function request(path: string, body?: unknown, requestOrigin = origin) {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Origin: requestOrigin, Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual' });
    const values = response.headers.getSetCookie();
    if (values.length) cookie = values.map(value => value.split(';')[0]).join('; ');
    return response;
  }
  try {
    assert.equal((await request('/api/auth/email', { action: 'signin', email, password }, 'https://evil.example')).status, 403);
    assert.equal((await request('/api/auth/email', { action: 'signup', email, password: 'short' })).status, 400);
    const signup = await request('/api/auth/email', { action: 'signup', email, password, next: '//evil.example' });
    assert.equal(signup.status, 200);
    assert.ok(signup.headers.getSetCookie().some(value => value.startsWith('tb_supabase=') && /HttpOnly/i.test(value)), 'Local signup must set private session cookies');
    assert.match((await signup.json()).redirect, /^\/register\/complete\?/);
    const account = (await (await request('/api/auth/session')).json()).account;
    assert.ok(account?.id); assert.equal(account.onboarding, 'pending'); assert.deepEqual(account.roles, ['traveler']);
    const record = await db.accountDocument.findUniqueOrThrow({ where: { id: account.id } });
    userId = record.supabaseUserId!;
    assert.equal(JSON.stringify(record.data).includes(password), false, 'Application data must never store the password');
    assert.equal((await request('/api/auth/onboarding', { displayName: 'Email test buddy', acceptAccountCreation: true, accountType: 'buddy' })).status, 200);
    assert.equal((await request('/api/auth/logout', {})).status, 200);
    cookie = '';
    const invalid = await request('/api/auth/email', { action: 'signin', email, password: 'wrong-password' });
    assert.equal(invalid.status, 401); assert.equal(invalid.headers.getSetCookie().length, 0);
    const login = await request('/api/auth/email', { action: 'signin', email, password, next: '//evil.example' });
    assert.equal(login.status, 200); assert.equal((await login.json()).redirect, '/account/security');
    assert.ok(login.headers.getSetCookie().some(value => /HttpOnly/i.test(value)));
    const restored = (await (await request('/api/auth/session')).json()).account;
    assert.equal(restored.id, account.id); assert.deepEqual(restored.roles, ['provider']);
    const saved = await db.accountDocument.findUniqueOrThrow({ where: { id: account.id } });
    await db.accountDocument.update({ where: { id: account.id }, data: { data: { ...(saved.data as object), status: 'suspended' } } });
    const suspended = await request('/api/auth/email', { action: 'signin', email, password });
    assert.equal(suspended.status, 403);
    assert.ok(suspended.headers.getSetCookie().some(value => value.startsWith('tb_supabase=;')), 'Suspended sign-in must clear issued session cookies');
    console.log('Email HTTP checks passed: public signup without verification, private cookies, buddy onboarding, wrong-password rejection, returning-user sign-in, safe redirects, suspended-account rejection, and origin protection.');
  } finally {
    if (!userId) {
      const { data } = await admin.auth.admin.listUsers();
      userId = data.users.find(user => user.email === email)?.id;
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
      await db.accountDocument.deleteMany({ where: { supabaseUserId: userId } });
    }
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Email HTTP checks failed'); process.exitCode = 1; });
