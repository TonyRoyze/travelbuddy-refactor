import type { AccountDocument } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema, googleIdentityDataSchema } from './documents';

function readAccount(record: AccountDocument) {
  if (record.schemaVersion !== 1) throw new Error('Unsupported account document version.');
  return { ...record, data: accountDataSchema.parse(record.data) };
}

/** Read-side handlers for account and identity lookups. */
export async function findAccount(id: string) {
  const record = await documentDatabase().accountDocument.findUnique({ where: { id } });
  return record ? readAccount(record) : null;
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
