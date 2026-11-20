import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { authCookieOptions, supabaseConfig } from './config';

export function requestAuthClient(request: NextRequest, response?: NextResponse) {
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        for (const { name, value, options } of cookies) {
          request.cookies.set(name, value);
          response?.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) response?.headers.set(name, value);
      },
    },
  });
}
