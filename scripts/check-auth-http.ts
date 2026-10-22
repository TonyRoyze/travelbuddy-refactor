import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createAuthTestUser } from './auth-test-user';
import { documentDatabase } from '../src/lib/backend/database';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());

async function main() {
  const origin = process.env.AUTH_APP_URL!;
  for (const value of [origin, process.env.SUPABASE_URL!]) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error('HTTP integration is restricted to local app and Supabase instances.');
  }
  const auth = await createAuthTestUser('HTTP integration');
  const db = documentDatabase();
  let cookie = auth.cookie;
  async function request(path: string, body?: unknown) {
    return fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual' });
  }
  try {
    const session = await request('/api/auth/session');
    assert.equal(session.status, 200);
    const account = (await session.json()).account;
    assert.ok(account?.id); assert.deepEqual(account.roles, ['traveler']);
    const jar = new Map(cookie.split('; ').map(pair => { const index = pair.indexOf('='); return [pair.slice(0, index), pair.slice(index + 1)] as [string, string]; }));
    const encoded = jar.get('tb_supabase')!;
    const savedSession = JSON.parse(Buffer.from(encoded.slice('base64-'.length), 'base64url').toString());
    savedSession.expires_at = Math.floor(Date.now() / 1000) - 10;
    jar.set('tb_supabase', 'base64-' + Buffer.from(JSON.stringify(savedSession)).toString('base64url'));
    cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const refreshed = await request('/api/auth/session');
    assert.equal(refreshed.status, 200);
    assert.equal((await refreshed.json()).account.id, account.id);
    assert.ok(refreshed.headers.getSetCookie().some(value => value.startsWith('tb_supabase=') && /HttpOnly/i.test(value)), 'Middleware must persist refreshed tokens in private cookies');
    assert.match(refreshed.headers.get('cache-control')!, /no-store/);
    for (const value of refreshed.headers.getSetCookie()) {
      const pair = value.split(';')[0]; const index = pair.indexOf('='); jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const onboarding = await request('/register/complete');
    assert.equal(onboarding.status, 200); const onboardingHtml = await onboarding.text(); assert.match(onboardingHtml, /Complete registration/); assert.match(onboardingHtml, /Choose your account type/); assert.match(onboardingHtml, /value="buddy"/);
    const pending = await request('/account/security');
    assert.ok([200, 307].includes(pending.status));
    if (pending.status === 307) assert.equal(new URL(pending.headers.get('location')!, origin).pathname, '/register/complete');
    else { const html = await pending.text(); assert.match(html, /\/register\/complete/); assert.equal(html.includes('Your TravelBuddy account</h2>'), false, 'Pending accounts must not render the protected account page'); }
    for (const accountType of ['admin', 'guide', 'provider']) {
      assert.equal((await request('/api/auth/onboarding', { displayName: 'HTTP buddy', acceptAccountCreation: true, accountType })).status, 400, 'Only public account types can be selected');
    }
    assert.equal((await request('/api/auth/onboarding', { displayName: 'HTTP buddy', acceptAccountCreation: true, accountType: 'buddy' })).status, 200);
    const registered = (await (await request('/api/auth/session')).json()).account;
    assert.deepEqual(registered.roles, ['provider'], 'Buddy registration must save the existing provider role');
    assert.equal(registered.onboarding, 'completed');
    assert.equal((await request('/api/requests', { title: 'Buddy cannot post', destination: 'Ella', details: 'Only travellers should be able to post requests.' })).status, 403);
    assert.equal((await request('/api/auth/onboarding', { displayName: 'Changed', acceptAccountCreation: true, accountType: 'traveler' })).status, 409, 'Completed accounts cannot change role by replaying registration');
    assert.deepEqual((await (await request('/api/auth/session')).json()).account.roles, ['provider']);
    const security = await request('/account/security');
    assert.equal(security.status, 200); assert.match(await security.text(), /HTTP buddy/);
    assert.match(security.headers.get('cache-control')!, /no-store/);
    const signIn = await request('/api/auth/signin', { provider: 'google', next: '//evil.example' });
    assert.equal(signIn.status, 200);
    assert.match(signIn.headers.get('set-cookie')!, /HttpOnly/i);
    assert.match(signIn.headers.get('set-cookie')!, /SameSite=lax/i);
    const url = new URL((await signIn.json()).url);
    assert.equal(url.pathname, '/auth/v1/authorize');
    assert.equal(url.searchParams.get('code_challenge_method'), 's256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.equal(new URL(url.searchParams.get('redirect_to')!).searchParams.get('next'), '/account');
    assert.equal((await request('/api/auth/logout', {})).status, 200);
    const traveler = await createAuthTestUser('HTTP traveller');
    cookie = traveler.cookie;
    try {
      assert.equal((await request('/api/auth/onboarding', { displayName: 'HTTP traveller', acceptAccountCreation: true, accountType: 'traveler' })).status, 200);
      assert.deepEqual((await (await request('/api/auth/session')).json()).account.roles, ['traveler']);
      assert.equal((await request('/api/requests', { title: 'Traveller registration test', destination: 'Ella', details: 'Testing traveller request permissions after registration.' })).status, 201);
    } finally {
      await traveler.remove();
      await db.accountDocument.deleteMany({ where: { supabaseUserId: traveler.user.id } });
    }
    console.log('HTTP auth passed: actual middleware refresh, private cookies, traveller/buddy registration and request permissions, role validation, replay protection, SSR onboarding/account gates, Supabase sessions, Google PKCE initiation, safe return URLs, and logout.');
  } finally {
    await auth.remove();
    await db.accountDocument.deleteMany({ where: { supabaseUserId: auth.user.id } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'HTTP integration failed'); process.exitCode = 1; });
