import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { documentDatabaseUrl } from '../src/lib/backend/config';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = createRequire(require.resolve('next/package.json'))('@next/env');
loadEnvConfig(process.cwd());
const action = process.argv[2];
if (!['generate', 'validate', 'deploy'].includes(action)) {
  throw new Error('Expected generate, validate, or deploy.');
}
if (action === 'deploy') {
  documentDatabaseUrl();
} else {
  // Client generation and schema validation require no live database.
  process.env.DOCUMENT_DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused?schema=travelbuddy_backend';
}
const args = action === 'deploy' ? ['migrate', 'deploy'] : [action];
const result = spawnSync(process.execPath, [require.resolve('prisma'), ...args, '--schema', 'prisma/documents/schema.prisma'], {
  stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
