import type { AccountDocument } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema } from './documents';
import type { AccountData } from './documents';

export class DocumentConflictError extends Error {
  constructor() { super('Account changed or does not exist; reload before saving.'); }
}

function readAccount(record: AccountDocument) {
  if (record.schemaVersion !== 1) throw new Error('Unsupported account document version.');
  return { ...record, data: accountDataSchema.parse(record.data) };
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
