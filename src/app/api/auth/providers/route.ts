import { NextResponse } from 'next/server';
import { socialProviders } from '@/lib/backend/auth-security';
import { supabaseConfig } from '@/lib/supabase/config';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { url, key } = supabaseConfig();
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Auth unavailable');
    const settings = await response.json();
    return NextResponse.json({ providers: Object.fromEntries(socialProviders.map(provider => [provider, settings.external?.[provider] === true])) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
