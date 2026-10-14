import type { NextRequest } from 'next/server';
import { requestAuthClient } from '../supabase/request';
import { serverAuthClient } from '../supabase/server';
import { resolveSupabaseAccount } from './supabase-account';

export async function sessionAccount(request?: NextRequest) {
  if (request && !request.cookies.getAll().some(cookie => cookie.name.startsWith('tb_supabase'))) return null;
  const client = request ? requestAuthClient(request) : serverAuthClient();
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403 || error.code === 'refresh_token_not_found' || error.code === 'refresh_token_already_used') return null;
    throw error;
  }
  if (!data.user) return null;
  const account = await resolveSupabaseAccount(data.user);
  return account.data.status === 'active' ? account : null;
}

export function publicAccount(account: NonNullable<Awaited<ReturnType<typeof sessionAccount>>>) {
  return { id: account.id, displayName: account.data.displayName, roles: account.data.roles, onboarding: account.data.onboarding, revision: account.revision };
}
