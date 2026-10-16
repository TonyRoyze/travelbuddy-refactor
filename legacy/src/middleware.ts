import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { authCookieOptions, supabaseConfig } from './lib/supabase/config';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!request.cookies.getAll().some(cookie => cookie.name.startsWith('tb_supabase'))) return response;
  try {
    const { url, key } = supabaseConfig();
    const client = createServerClient(url, key, {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          for (const { name, value } of cookies) request.cookies.set(name, value);
          const previous = response;
          response = NextResponse.next({ request });
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
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/callback|api/auth/signin|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)'] };
