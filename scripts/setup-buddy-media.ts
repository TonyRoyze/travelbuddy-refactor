import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { MEDIA_BUCKET } from '../src/lib/backend/media';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());
async function main() {
  const secret = process.env.SUPABASE_STORAGE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret || !process.env.SUPABASE_URL) throw new Error('Configure SUPABASE_URL and a server-only storage secret.');
  const storage = createClient(process.env.SUPABASE_URL, secret, { auth: { persistSession: false } }).storage;
  const options = { public: false, fileSizeLimit: 25 * 1024 * 1024, allowedMimeTypes: ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'] };
  const existing = await storage.getBucket(MEDIA_BUCKET);
  const result = existing.data ? await storage.updateBucket(MEDIA_BUCKET, options) : await storage.createBucket(MEDIA_BUCKET, options);
  if (result.error) throw result.error;
  console.log('Private buddy-media bucket is ready. Uploads are authorized through the buddy API.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Media storage setup failed.'); process.exitCode = 1; });
