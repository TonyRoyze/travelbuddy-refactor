import { PrismaClient } from '../../generated/documents';
import { documentDatabaseUrl } from './config';

const backendGlobal = globalThis as unknown as { travelBuddyDocuments?: PrismaClient };

// Lazy construction lets the frontend still build without a database configured.
export function documentDatabase(): PrismaClient {
  if (typeof window !== 'undefined') throw new Error('The document database is server-only.');
  const url = documentDatabaseUrl();
  if (!backendGlobal.travelBuddyDocuments) {
    backendGlobal.travelBuddyDocuments = new PrismaClient({ datasources: { db: { url } } });
  }
  return backendGlobal.travelBuddyDocuments;
}
