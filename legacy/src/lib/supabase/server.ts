import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authCookieOptions, supabaseConfig } from './config';

export function serverAuthClient() {
  const store = cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        // Server Components cannot write cookies; middleware persists refreshed tokens.
        try { for (const { name, value, options } of values) store.set(name, value, options); } catch {}
      },
    },
  });
}
