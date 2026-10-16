import type { User } from '@supabase/supabase-js';
import { z } from 'zod';
import { documentDatabase } from './database';
import { accountDataSchema, newTravelerData } from './documents';

// Only call with a user verified by Supabase Auth. User metadata never determines roles.
export async function resolveSupabaseAccount(user: User) {
  const id = z.string().uuid().parse(user.id);
  const name = user.user_metadata?.full_name || user.user_metadata?.name;
  const displayName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : 'Traveler';
  const db = documentDatabase();
  let record;
  try {
    record = await db.accountDocument.upsert({
    where: { supabaseUserId: id },
    create: { supabaseUserId: id, data: newTravelerData(displayName) },
    update: {},
    });
  } catch (error) {
    // Prisma can use a read/create sequence for an empty update; recover sign-in races.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
    record = await db.accountDocument.findUnique({ where: { supabaseUserId: id } });
    if (!record) throw error;
  }
  if (record.schemaVersion !== 1) throw new Error('Unsupported account document version.');
  return { ...record, data: accountDataSchema.parse(record.data) };
}
