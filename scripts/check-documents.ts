import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { documentDatabaseUrl } from '../src/lib/backend/config';
import { accountDataSchema, googleIdentityDataSchema, newTravelerData } from '../src/lib/backend/documents';

assert.deepEqual(newTravelerData('  Maya  '), {
  displayName: 'Maya', roles: ['traveler'], status: 'active', onboarding: 'pending',
});
for (const input of [
  { ...newTravelerData('Maya'), roles: ['owner'] },
  { ...newTravelerData('Maya'), roles: [] },
  { ...newTravelerData('Maya'), roles: ['admin', 'admin'] },
  { ...newTravelerData('Maya'), password: 'must-not-be-stored' },
  { ...newTravelerData('Maya'), status: null },
]) assert.equal(accountDataSchema.safeParse(input).success, false);
assert.throws(() => newTravelerData('   '));

const identity = { accountId: randomUUID(), provider: 'google', providerSubject: 'subject-123', email: 'maya@example.com', emailVerified: true };
assert.equal(googleIdentityDataSchema.safeParse(identity).success, true);
for (const input of [
  { ...identity, accountId: 'not-a-uuid' },
  { ...identity, providerSubject: ' ' },
  { ...identity, email: 'invalid' },
  { ...identity, emailVerified: 'true' },
  { ...identity, accessToken: 'must-not-be-stored' },
]) assert.equal(googleIdentityDataSchema.safeParse(input).success, false);

assert.equal(documentDatabaseUrl('postgresql://local:local@localhost:5432/test?schema=travelbuddy_backend').includes('travelbuddy_backend'), true);
for (const value of ['', 'not-a-url', 'https://example.com/test?schema=travelbuddy_backend', 'postgresql://localhost?schema=travelbuddy_backend', 'postgresql://localhost/test', 'postgresql://localhost/test?schema=public', 'postgresql://localhost/test?schema=travelbuddy_backend&schema=public']) {
  assert.throws(() => documentDatabaseUrl(value));
}
console.log('Document validation and database namespace checks passed.');
