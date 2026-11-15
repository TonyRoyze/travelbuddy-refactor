import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { User } from '@supabase/supabase-js';
import { documentDatabase } from '../src/lib/backend/database';
import { resolveSupabaseAccount } from '../src/lib/backend/supabase-account';
import { updateAccount, DocumentConflictError } from '../src/lib/backend/account-commands';
import { findAccount } from '../src/lib/backend/account-queries';

const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.DOCUMENT_TEST_DATABASE_URL;
  if (!url || url === process.env.DOCUMENT_DATABASE_URL) throw new Error('Set DOCUMENT_TEST_DATABASE_URL to a separate migrated test database.');
  process.env.DOCUMENT_DATABASE_URL = url;
  const db = documentDatabase();
  const user = { id: randomUUID(), user_metadata: { full_name: 'Integration traveler', roles: ['admin'], status: 'active' } } as unknown as User;
  try {
    const [first, second] = await Promise.all([resolveSupabaseAccount(user), resolveSupabaseAccount(user)]);
    assert.equal(first.id, second.id, 'Concurrent sign-in must reuse the same account');
    assert.equal(first.supabaseUserId, user.id);
    assert.deepEqual(first.data.roles, ['traveler'], 'User-editable metadata cannot grant privileges');
    assert.equal((await findAccount(first.id))?.id, first.id);
    const saved = await updateAccount(first.id, first.revision, { ...first.data, onboarding: 'completed' });
    await assert.rejects(updateAccount(first.id, first.revision, first.data), DocumentConflictError);
    assert.equal(saved.revision, first.revision + 1);
    await assert.rejects(db.accountDocument.create({ data: { data: { ...first.data, status: null } } }));
    assert.equal(await db.accountDocument.count({ where: { supabaseUserId: user.id } }), 1);
    console.log('Document integration passed: Supabase identity uniqueness, default roles, optimistic concurrency, and database validation.');
  } finally {
    await db.accountDocument.deleteMany({ where: { supabaseUserId: user.id } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Document integration failed'); process.exitCode = 1; });
