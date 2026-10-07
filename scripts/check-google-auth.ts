import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { authConfig, CHALLENGE_COOKIE, createChallenge, hashSessionToken, sameOrigin, verifiedGoogleProfile, verifyChallenge } from '../src/lib/backend/auth-security';
import { resolveGoogleAccount } from '../src/lib/backend/google-account';
import { newTravelerData } from '../src/lib/backend/documents';
import { GET as challengeRoute, POST as googleRoute } from '../src/app/api/auth/google/route';
import { POST as onboardingRoute } from '../src/app/api/auth/onboarding/route';
import { POST as logoutRoute } from '../src/app/api/auth/logout/route';

async function main() {
  process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
  process.env.AUTH_SECRET = 'test-only-secret-which-is-at-least-32-characters';
  process.env.AUTH_APP_URL = 'https://travelbuddy.example';
  const challenge = createChallenge();
  assert.equal(verifyChallenge(challenge.cookie, challenge.csrf).nonce, challenge.nonce);
  assert.throws(() => verifyChallenge(`${challenge.cookie}x`, challenge.csrf));
  assert.throws(() => verifyChallenge(challenge.cookie, 'x'.repeat(43)));
  assert.throws(() => verifyChallenge(challenge.cookie, challenge.csrf, challenge.expires));
  assert.equal(sameOrigin(new Request('https://travelbuddy.example/api', { headers: { origin: 'https://evil.example' } })), false);
  assert.equal(sameOrigin(new Request('https://travelbuddy.example/api')), false);
  assert.equal(hashSessionToken('session').length, 64);
  assert.notEqual(hashSessionToken('session'), hashSessionToken('other-session'));

  const claims = { sub: 'google-stable-id', email: 'maya@example.com', email_verified: true, nonce: challenge.nonce, name: 'Maya' };
  const profile = verifiedGoogleProfile(claims, challenge.nonce);
  assert.throws(() => verifiedGoogleProfile({ ...claims, email_verified: false }, challenge.nonce));
  assert.throws(() => verifiedGoogleProfile({ ...claims, nonce: 'wrong' }, challenge.nonce));
  const account = { id: randomUUID(), data: newTravelerData('Maya'), schemaVersion: 1, revision: 1, createdAt: new Date(), updatedAt: new Date() };
  let created = 0;
  assert.equal((await resolveGoogleAccount(profile, { find: async subject => { assert.equal(subject, claims.sub); return account; }, create: async () => { throw new Error('Must not recreate a returning account'); } })).id, account.id);
  await resolveGoogleAccount(profile, { find: async () => null, create: async (_name, identity) => {
    created++; assert.equal(identity.providerSubject, claims.sub); assert.equal('displayName' in identity, false); return account;
  } });
  assert.equal(created, 1);
  let lookup = 0;
  assert.equal((await resolveGoogleAccount(profile, { find: async () => ++lookup === 1 ? null : account, create: async () => { throw { code: 'P2002' }; } })).id, account.id);
  await assert.rejects(resolveGoogleAccount(profile, { find: async () => null, create: async () => { throw new Error('Database unavailable'); } }));

  const challengeResponse = await challengeRoute();
  assert.equal(challengeResponse.headers.get('cache-control'), 'no-store');
  const cookie = challengeResponse.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=strict/i);
  const request = (path: string, body: unknown, origin = 'https://travelbuddy.example', challengeCookie = '') => new NextRequest(`https://travelbuddy.example${path}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: `${CHALLENGE_COOKIE}=${challengeCookie}` }, body: JSON.stringify(body),
  });
  assert.equal((await googleRoute(request('/api/auth/google', {}, 'https://evil.example'))).status, 403);
  assert.equal((await googleRoute(request('/api/auth/google', { credential: 'fake', csrf: 'x'.repeat(43) }, undefined, challenge.cookie))).status, 401);
  assert.equal((await onboardingRoute(request('/api/auth/onboarding', { roles: ['admin'] }))).status, 401);
  const logout = await logoutRoute(request('/api/auth/logout', {}));
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/i);
  process.env.AUTH_APP_URL = 'https://travelbuddy.example/redirect'; assert.throws(() => authConfig());
  process.env.AUTH_APP_URL = 'http://remote.example'; assert.throws(() => authConfig());
  process.env.AUTH_SECRET = ''; assert.equal((await challengeRoute()).status, 503);
  console.log('Google auth checks passed: CSRF, nonce, cookie flags, identity reuse, signup races, safe errors, unauthorized onboarding and logout.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
