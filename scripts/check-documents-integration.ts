import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { documentDatabase } from '../src/lib/backend/database';
import { createGoogleAccount, findGoogleAccount, updateAccount, DocumentConflictError } from '../src/lib/backend/accounts';
import { newTravelerData } from '../src/lib/backend/documents';

const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());

async function main() {
  // Run against an explicitly configured test database, never the app database.
  const testUrl = process.env.DOCUMENT_TEST_DATABASE_URL;
  if (!testUrl) throw new Error('Set DOCUMENT_TEST_DATABASE_URL to a migrated, disposable test database.');
  if (process.env.DOCUMENT_DATABASE_URL === testUrl) throw new Error('The test database must be separate from the app database.');
  process.env.DOCUMENT_DATABASE_URL = testUrl;
  const db = documentDatabase();
  const subject = `integration-${randomUUID()}`;
  const email = `${subject}@example.com`;
  let accountId: string | undefined;
  try {
    const claims = { providerSubject: subject, email, emailVerified: true };
    const results = await Promise.allSettled([
      createGoogleAccount('Integration traveler', claims),
      createGoogleAccount('Integration traveler', claims),
    ]);
    const winner = results.find(result => result.status === 'fulfilled');
    if (!winner || winner.status !== 'fulfilled') throw new Error('Concurrent signup did not create an account.');
    accountId = winner.value.id;
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await findGoogleAccount(subject))?.id, accountId);

    const updates = await Promise.allSettled([
      updateAccount(accountId, 1, { ...winner.value.data, displayName: 'Updated A' }),
      updateAccount(accountId, 1, { ...winner.value.data, displayName: 'Updated B' }),
    ]);
    assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(updates.filter(result => result.status === 'rejected' && result.reason instanceof DocumentConflictError).length, 1);

    // Bypass Zod to exercise database checks, including PostgreSQL NULL semantics.
    await assert.rejects(db.accountDocument.create({ data: { data: { ...newTravelerData('Invalid'), status: null } } }));
    await assert.rejects(db.authIdentityDocument.create({ data: { data: { accountId, provider: 'google', providerSubject: `${subject}-invalid`, email, emailVerified: null } } }));
    console.log('Database checks passed: identity uniqueness, concurrent updates, JSON constraints.');
  } finally {
    await db.authIdentityDocument.deleteMany({ where: { data: { path: ['providerSubject'], equals: subject } } });
    if (accountId) await db.accountDocument.delete({ where: { id: accountId } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Integration check failed'); process.exitCode = 1; });
