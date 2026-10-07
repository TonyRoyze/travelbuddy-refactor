import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const CHALLENGE_COOKIE = 'tb_google_challenge';
export const SESSION_COOKIE = 'tb_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const CHALLENGE_SECONDS = 600;

export function authConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.AUTH_SECRET;
  const value = process.env.AUTH_APP_URL;
  if (!clientId?.endsWith('.apps.googleusercontent.com') || !secret || secret.length < 32 || !value) {
    throw new Error('Google authentication configuration is missing or invalid.');
  }
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(local && url.protocol === 'http:' && process.env.NODE_ENV !== 'production'))) {
    throw new Error('AUTH_APP_URL must be an HTTPS origin (HTTP localhost is allowed in development).');
  }
  return { clientId, secret, origin: url.origin, secure: url.protocol === 'https:' };
}

export function sameOrigin(request: Request) {
  return request.headers.get('origin') === authConfig().origin;
}

export function randomToken() { return randomBytes(32).toString('base64url'); }
export function hashSessionToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const challengeSchema = z.object({ nonce: z.string().length(43), csrf: z.string().length(43), expires: z.number().int() }).strict();
export function createChallenge(now = Date.now()) {
  const payload = { nonce: randomToken(), csrf: randomToken(), expires: now + CHALLENGE_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', authConfig().secret).update(body).digest('base64url');
  return { ...payload, cookie: `${body}.${signature}` };
}

export function verifyChallenge(cookie: string, csrf: string, now = Date.now()) {
  const parts = cookie.split('.');
  if (parts.length !== 2 || cookie.length > 1000) throw new Error('Invalid login challenge.');
  const signature = createHmac('sha256', authConfig().secret).update(parts[0]).digest('base64url');
  if (!equalSecret(parts[1], signature)) throw new Error('Invalid login challenge.');
  const payload = challengeSchema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')));
  if (payload.expires <= now || payload.expires > now + CHALLENGE_SECONDS * 1000 || !equalSecret(payload.csrf, csrf)) throw new Error('Login challenge expired or did not match.');
  return payload;
}

// Called only after Google's library verifies signature, issuer, audience and expiry.
export function verifiedGoogleProfile(input: unknown, nonce: string) {
  const claims = z.object({
    sub: z.string().trim().min(1).max(255), email: z.string().email().max(320),
    email_verified: z.literal(true), nonce: z.string(), name: z.string().trim().min(1).optional(),
  }).passthrough().parse(input);
  if (!equalSecret(claims.nonce, nonce)) throw new Error('Google login nonce did not match.');
  return { displayName: (claims.name || 'Traveler').slice(0, 120), providerSubject: claims.sub, email: claims.email, emailVerified: true };
}

export const sessionDataSchema = z.object({ accountId: z.string().uuid(), tokenHash: z.string().regex(/^[0-9a-f]{64}$/), expiresAt: z.string().datetime() }).strict();
