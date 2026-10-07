import { documentDatabase } from './database';
import { findAccount } from './accounts';
import { hashSessionToken, randomToken, sessionDataSchema, SESSION_SECONDS } from './auth-security';

export async function createSession(accountId: string) {
  const token = randomToken();
  const data = sessionDataSchema.parse({ accountId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString() });
  await documentDatabase().sessionDocument.create({ data: { data } });
  return token;
}

export async function sessionAccount(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = await documentDatabase().sessionDocument.findFirst({ where: { data: { path: ['tokenHash'], equals: hashSessionToken(token) } } });
  if (!record || record.schemaVersion !== 1) return null;
  const data = sessionDataSchema.parse(record.data);
  if (Date.parse(data.expiresAt) <= Date.now()) return null;
  const account = await findAccount(data.accountId);
  return account?.data.status === 'active' ? account : null;
}

export async function revokeSession(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await documentDatabase().sessionDocument.deleteMany({ where: { data: { path: ['tokenHash'], equals: hashSessionToken(token) } } });
}

export function publicAccount(account: NonNullable<Awaited<ReturnType<typeof sessionAccount>>>) {
  return { id: account.id, displayName: account.data.displayName, roles: account.data.roles, onboarding: account.data.onboarding, revision: account.revision };
}
