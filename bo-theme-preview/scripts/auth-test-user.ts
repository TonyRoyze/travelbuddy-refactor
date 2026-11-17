import { randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { adminAuthClient } from '../src/lib/supabase/admin';
import { authCookieOptions, supabaseConfig } from '../src/lib/supabase/config';

export async function createAuthTestUser(name: string) {
  const email = `tb-${randomBytes(12).toString('hex')}@example.test`;
  const password = randomBytes(32).toString('base64url');
  const admin = adminAuthClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, roles: ['admin'] } });
  if (error || !data.user) throw error || new Error('Unable to create test user');
  const user = data.user;
  const { url, key } = supabaseConfig();
  const jar = new Map<string, string>();
  const client = createServerClient(url, key, { cookieOptions: authCookieOptions(), cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => { for (const value of values) jar.set(value.name, value.value); },
  } });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) { await admin.auth.admin.deleteUser(user.id); throw result.error; }
  return { user, client, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), remove: () => admin.auth.admin.deleteUser(user.id) };
}
