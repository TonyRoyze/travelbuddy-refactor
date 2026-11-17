import assert from 'node:assert/strict';

// Run against a local production build: SECURITY_TEST_URL=http://localhost:3000
// pnpm exec tsx scripts/check-security-http.ts
const origin = new URL(process.env.SECURITY_TEST_URL ?? 'http://localhost:3000');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Use a local test server');

async function check(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, origin), { ...init, redirect: 'manual' });
  for (const [name, expected] of Object.entries({
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'credentialless',
    'cross-origin-resource-policy': 'same-origin',
    'strict-transport-security': 'max-age=31536000',
  })) assert.equal(response.headers.get(name), expected, `${path}: ${name}`);
  assert.match(response.headers.get('permissions-policy')!, /geolocation=\(self\)/);
  assert.ok(response.headers.get('content-security-policy'), `${path}: CSP`);
  return response;
}

async function main() {
  const first = await check('/', { headers: { 'x-nonce': 'attacker-controlled', 'Content-Security-Policy': "script-src 'unsafe-inline'" } });
  assert.equal(first.status, 200);
  const policy = first.headers.get('content-security-policy')!;
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce && nonce !== 'attacker-controlled');
  assert.doesNotMatch(policy.split('script-src ')[1].split(';')[0], /unsafe-inline|unsafe-eval/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(first.headers.get('cache-control')!, /no-store/);
  const html = await first.text();
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  assert.ok(scripts.length > 1, 'Check custom script and Next bootstrap/hydration scripts');
  for (const script of scripts) assert.ok(script[1].includes(`nonce="${nonce}"`), 'Every script must have the response nonce');
  const assetPath = html.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/)?.[1];
  assert.ok(assetPath, 'Find a real production JS asset');
  const asset = await check(assetPath);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control')!, /immutable/);
  const second = await check('/');
  assert.notEqual(second.headers.get('content-security-policy')!.match(/'nonce-([^']+)'/)?.[1], nonce);
  await second.arrayBuffer();
  for (const path of ['/api/auth/session', '/auth/callback', '/missing-security-test.js']) {
    const response = await check(path);
    assert.match(response.headers.get('cache-control')!, /no-store/, path);
    await response.arrayBuffer();
  }
  const signIn = await check('/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin.origin }, body: '{}' });
  assert.match(signIn.headers.get('cache-control')!, /no-store/);
  await signIn.arrayBuffer();
  const sitemap = await check('/sitemap.xml');
  assert.match(sitemap.headers.get('content-type')!, /xml/);
  assert.match(await sitemap.text(), /<urlset/);
  const robots = await check('/robots.txt');
  assert.match(robots.headers.get('content-type')!, /text\/plain/);
  assert.match(await robots.text(), /Sitemap: .*\/sitemap.xml/);
  const image = await check('/brand/utrippers-symbol-blue.svg');
  assert.equal(image.status, 200);
  console.log('Security HTTP checks passed: headers on pages, APIs, redirects, errors and assets; unique matching script nonces; cache protection; immutable bundles; sitemap and robots.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
