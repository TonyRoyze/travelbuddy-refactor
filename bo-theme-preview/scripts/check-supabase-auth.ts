import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { authConfig, safeAuthReturn, sameOrigin } from '../src/lib/backend/auth-security';
import { authCookieOptions } from '../src/lib/supabase/config';
import { POST as signIn } from '../src/app/api/auth/signin/route';
import { GET as callback } from '../src/app/auth/callback/route';
import { POST as onboarding } from '../src/app/api/auth/onboarding/route';
import { GET as session } from '../src/app/api/auth/session/route';

async function main() {
  process.env.AUTH_APP_URL = 'https://travelbuddy.example';
  assert.equal(authConfig().secure, true);
  assert.equal(authCookieOptions().httpOnly, true);
  assert.equal(authCookieOptions().sameSite, 'lax');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/\n/evil.example']) assert.equal(safeAuthReturn(value), '/account/security');
  assert.equal(safeAuthReturn('/inbox?tab=replies'), '/inbox?tab=replies');
  assert.equal(sameOrigin(new Request('https://travelbuddy.example', { headers: { Origin: 'https://evil.example' } })), false);
  const request = (path: string, body: unknown, origin = 'https://travelbuddy.example') => new NextRequest(`https://travelbuddy.example${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await signIn(request('/api/auth/signin', { provider: 'google' }, 'https://evil.example'))).status, 403);
  assert.equal((await signIn(request('/api/auth/signin', { provider: 'evil' }))).status, 400);
  assert.equal((await onboarding(request('/api/auth/onboarding', { roles: ['admin'] }))).status, 401);
  const response = await session(new NextRequest('https://travelbuddy.example/api/auth/session', { headers: { Cookie: 'tb_session=legacy-token' } }));
  assert.equal((await response.json()).account, null, 'Legacy sessions must never authenticate');
  const failure = await callback(new NextRequest('https://travelbuddy.example/auth/callback?error=access_denied&next=https://evil.example'));
  assert.equal(failure.headers.get('location'), 'https://travelbuddy.example/login?error=signin');
  assert.match(failure.headers.get('cache-control')!, /no-store/);
  process.env.AUTH_APP_URL = 'http://remote.example'; assert.throws(() => authConfig());
  process.env.AUTH_APP_URL = 'https://travelbuddy.example/redirect'; assert.throws(() => authConfig());
  console.log('Supabase auth checks passed: origin protection, provider validation, private cookies, safe redirects, legacy-session rejection, and unauthorized onboarding.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
