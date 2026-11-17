import type { AccountDocument } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema } from './documents';

function readAccount(record: AccountDocument) {
  if (record.schemaVersion !== 1) throw new Error('Unsupported account document version.');
  return { ...record, data: accountDataSchema.parse(record.data) };
}

/** Read-side handlers for account and identity lookups. */
export async function findAccount(id: string) {
  const record = await documentDatabase().accountDocument.findUnique({ where: { id } });
  return record ? readAccount(record) : null;
}
