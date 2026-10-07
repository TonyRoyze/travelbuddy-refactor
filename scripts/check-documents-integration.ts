import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { documentDatabase } from '../src/lib/backend/database';
import { createGoogleAccount, findGoogleAccount, updateAccount, DocumentConflictError } from '../src/lib/backend/accounts';
import { newTravelerData } from '../src/lib/backend/documents';
import { createSession, sessionAccount, revokeSession } from '../src/lib/backend/sessions';
import { hashSessionToken } from '../src/lib/backend/auth-security';

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

    const token = await createSession(accountId);
    assert.equal((await sessionAccount(token))?.id, accountId);
    const session = await db.sessionDocument.findFirstOrThrow({ where: { data: { path: ['tokenHash'], equals: hashSessionToken(token) } } });
    assert.equal(JSON.stringify(session.data).includes(token), false);
    await revokeSession(token);
    assert.equal(await sessionAccount(token), null);
    const expiringToken = await createSession(accountId);
    const expiringSession = await db.sessionDocument.findFirstOrThrow({ where: { data: { path: ['tokenHash'], equals: hashSessionToken(expiringToken) } } });
    await db.sessionDocument.update({ where: { id: expiringSession.id }, data: { data: { ...(expiringSession.data as object), expiresAt: new Date(0).toISOString() } } });
    assert.equal(await sessionAccount(expiringToken), null);
    const suspendedToken = await createSession(accountId);
    const current = await db.accountDocument.findUniqueOrThrow({ where: { id: accountId } });
    await updateAccount(accountId, current.revision, { ...winner.value.data, status: 'suspended' });
    assert.equal(await sessionAccount(suspendedToken), null);

    // Bypass Zod to exercise database checks, including PostgreSQL NULL semantics.
    await assert.rejects(db.accountDocument.create({ data: { data: { ...newTravelerData('Invalid'), status: null } } }));
    await assert.rejects(db.authIdentityDocument.create({ data: { data: { accountId, provider: 'google', providerSubject: `${subject}-invalid`, email, emailVerified: null } } }));
    console.log('Database checks passed: identity uniqueness, concurrent updates, JSON constraints, session hashing/expiry/revocation and suspended accounts.');
  } finally {
    await db.authIdentityDocument.deleteMany({ where: { data: { path: ['providerSubject'], equals: subject } } });
    if (accountId) {
      await db.sessionDocument.deleteMany({ where: { data: { path: ['accountId'], equals: accountId } } });
      await db.accountDocument.delete({ where: { id: accountId } });
    }
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Integration check failed'); process.exitCode = 1; });
