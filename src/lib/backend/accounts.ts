import type { AccountDocument } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema, googleIdentityDataSchema, newTravelerData } from './documents';
import type { AccountData, GoogleIdentityData } from './documents';

export class DocumentConflictError extends Error {
  constructor() { super('Account changed or does not exist; reload before saving.'); }
}

function readAccount(record: AccountDocument) {
  if (record.schemaVersion !== 1) throw new Error('Unsupported account document version.');
  return { ...record, data: accountDataSchema.parse(record.data) };
}

export async function findAccount(id: string) {
  const record = await documentDatabase().accountDocument.findUnique({ where: { id } });
  return record ? readAccount(record) : null;
}

// Internal backend operation. The Google login feature must verify the ID token
// before calling this; never accept these claims directly from a request body.
// Duplicate Google identities fail atomically, including concurrent signup attempts.
export async function createGoogleAccount(displayName: string, claims: Omit<GoogleIdentityData, 'accountId' | 'provider'>) {
  const data = newTravelerData(displayName);
  return documentDatabase().$transaction(async tx => {
    const account = await tx.accountDocument.create({ data: { data } });
    const identity = googleIdentityDataSchema.parse({ ...claims, accountId: account.id, provider: 'google' });
    await tx.authIdentityDocument.create({ data: { data: identity } });
    return readAccount(account);
  });
}

export async function findGoogleAccount(providerSubject: string) {
  const subject = googleIdentityDataSchema.shape.providerSubject.parse(providerSubject);
  const identity = await documentDatabase().authIdentityDocument.findFirst({
    where: { AND: [
      { data: { path: ['provider'], equals: 'google' } },
      { data: { path: ['providerSubject'], equals: subject } },
    ] },
  });
  if (!identity) return null;
  if (identity.schemaVersion !== 1) throw new Error('Unsupported identity document version.');
  const data = googleIdentityDataSchema.parse(identity.data);
  const account = await findAccount(data.accountId);
  if (!account) throw new Error('Identity references a missing account.');
  return account;
}

// Trusted server operation only: authorization belongs to the calling feature.
export async function updateAccount(id: string, expectedRevision: number, input: AccountData) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('Invalid account revision.');
  const data = accountDataSchema.parse(input);
  return documentDatabase().$transaction(async tx => {
    const result = await tx.accountDocument.updateMany({
      where: { id, revision: expectedRevision, schemaVersion: 1 },
      data: { data, revision: { increment: 1 } },
    });
    if (result.count !== 1) throw new DocumentConflictError();
    return readAccount(await tx.accountDocument.findUniqueOrThrow({ where: { id } }));
  });
}
