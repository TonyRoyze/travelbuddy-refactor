import { documentDatabase } from './database';
import { accountDataSchema } from './documents';

export function testAccountsEnabled() {
  if (process.env.NODE_ENV !== 'development' || process.env.TEST_ACCOUNTS_ENABLED !== 'true' || !process.env.TEST_ACCOUNT_DATABASE_HOST) return false;
  try { return new URL(process.env.DOCUMENT_DATABASE_URL!).hostname === process.env.TEST_ACCOUNT_DATABASE_HOST && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.SUPABASE_URL!).hostname); } catch { return false; }
}

export const TEST_BUDDY_ID = '45308b2d-2441-4f80-b05a-b8b56c1f7001';
export const TEST_TRAVELER_ID = '45308b2d-2441-4f80-b05a-b8b56c1f7002';
export const TEST_REQUEST_ID = '45308b2d-2441-4f80-b05a-b8b56c1f7003';

export async function seedTestAccounts() {
  if (!testAccountsEnabled()) throw new Error('Test accounts are disabled.');
  const db = documentDatabase();
  await db.$transaction(async tx => {
    for (const [id, displayName, roles] of [[TEST_BUDDY_ID, 'Ravi · Test buddy', ['provider']], [TEST_TRAVELER_ID, 'Maya · Test traveller', ['traveler']]] as const) {
      await tx.accountDocument.upsert({ where: { id }, create: { id, data: accountDataSchema.parse({ displayName, roles, status: 'active', onboarding: 'completed' }) }, update: {} });
    }
    await tx.travelRequest.upsert({
      where: { id: TEST_REQUEST_ID }, update: {},
      create: { id: TEST_REQUEST_ID, travelerId: TEST_TRAVELER_ID, title: 'Sunrise walk and a local breakfast in Ella', destination: 'Ella, Sri Lanka', details: 'We’re two travellers looking for an easy sunrise walk, followed by a local breakfast. Please include your total price and let us know if you can pick us up.', pickupLocation: 'Ella railway station', latitude: 6.875, longitude: 81.047 },
    });
  });
}
