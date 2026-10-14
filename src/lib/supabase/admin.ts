import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export function adminAuthClient() {
  if (typeof window !== 'undefined') throw new Error('Supabase administration is server-only.');
  const { url } = supabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is required for development test accounts.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
