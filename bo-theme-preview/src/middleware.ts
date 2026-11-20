import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { authCookieOptions, supabaseConfig } from './lib/supabase/config';

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const development = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // Leaflet and animated UI components require inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com https://*.tile.openstreetmap.org",
    "font-src 'self'",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src https://www.google.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
  // Overwrite caller-supplied values. Next uses this request CSP to put the
  // same nonce on its bootstrap and hydration scripts.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);
  const next = () => NextResponse.next({ request: { headers: request.headers } });
  const secure = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
  let response = next();
  // PKCE callback and sign-in manage their own auth cookies.
  if (['/auth/callback', '/api/auth/signin'].includes(request.nextUrl.pathname)
    || !request.cookies.getAll().some(cookie => cookie.name.startsWith('tb_supabase'))) return secure(response);
  try {
    const { url, key } = supabaseConfig();
    const client = createServerClient(url, key, {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          for (const { name, value } of cookies) request.cookies.set(name, value);
          const previous = response;
          response = next();
          for (const cookie of previous.cookies.getAll()) response.cookies.set(cookie);
          for (const name of ['cache-control', 'expires', 'pragma']) {
            const value = previous.headers.get(name);
            if (value) response.headers.set(name, value);
          }
          for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
    });
    await client.auth.getUser();
  } catch {
    // Protected routes verify the user again and fail closed if Auth is unavailable.
  }
  return secure(response);
}
// Exclude only known public asset directories. A URL suffix must never allow
// an account/API response to bypass the policy or cache protection.
export const config = { matcher: ['/((?!_next/static/|_next/image|brand/|favicon.ico).*)'] };
