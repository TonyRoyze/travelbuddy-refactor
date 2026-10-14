import { authConfig } from '../backend/auth-security';

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid Supabase URL.');
  return { url: parsed.origin, key };
}

// Auth runs entirely on the server; tokens and PKCE verifiers stay in HttpOnly cookies.
export function authCookieOptions() {
  return { name: 'tb_supabase', httpOnly: true, secure: authConfig().secure, sameSite: 'lax' as const, path: '/' };
}
