import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { supabaseConfig } from '../supabase/config';
import { documentDatabase } from './database';
import { BuddyError } from './buddy-access';
import { MAX_CLIP_BYTES, MAX_CLIP_SECONDS, mediaUrl } from '../package-editor';

export const MEDIA_BUCKET = 'buddy-media';
export function mediaStorage() {
  const key = process.env.SUPABASE_STORAGE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('A server-only Supabase storage secret is required.');
  return createClient(supabaseConfig().url, key, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from(MEDIA_BUCKET);
}
const exec = promisify(execFile);
const accepted = new Map([
  ['video/mp4', 'mp4'], ['video/webm', 'webm'],
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
]);

export async function readUpload(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new BuddyError('Choose a photo or video to upload.', 400);
  const maxBody = MAX_CLIP_BYTES + 65536;
  if (Number(request.headers.get('content-length')) > maxBody) throw new BuddyError('Files must be 25 MB or smaller.', 413);
  const reader = request.body?.getReader(); if (!reader) throw new BuddyError('Choose a file.', 400);
  let bytes = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > maxBody) { await reader.cancel(); throw new BuddyError('Files must be 25 MB or smaller.', 413); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type')! }, body: Buffer.concat(chunks) }).formData(); }
  catch { throw new BuddyError('The upload is incomplete. Choose the file again.', 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) throw new BuddyError('Choose a non-empty file.', 400);
  if (file.size > MAX_CLIP_BYTES) throw new BuddyError('Files must be 25 MB or smaller.', 413);
  if (!accepted.has(file.type)) throw new BuddyError('Use MP4 or WebM video, or a JPEG, PNG or WebP photo.', 400);
  return file;
}

export async function saveMedia(ownerId: string, file: File) {
  const extension = accepted.get(file.type)!;
  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = await mkdtemp(join(tmpdir(), 'tb-media-'));
  let durationSeconds: number | null = null;
  try {
    const path = join(dir, `upload.${extension}`); await writeFile(path, bytes);
    let probe: { format?: { duration?: string; format_name?: string }; streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[] };
    try {
      const { stdout } = await exec(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height', '-of', 'json', path], { timeout: 15000, maxBuffer: 65536 });
      probe = JSON.parse(stdout);
    } catch { throw new BuddyError('This file could not be read. Export a valid MP4, WebM, JPEG, PNG or WebP and try again.', 400); }
    const video = probe.streams?.find(stream => stream.codec_type === 'video');
    if (!video?.width || !video.height || video.width > 4096 || video.height > 4096) throw new BuddyError('Use media with dimensions up to 4096 × 4096.', 400);
    if (file.type.startsWith('video/')) {
      durationSeconds = Number(probe.format?.duration);
      const expected = file.type === 'video/mp4' ? /mp4/ : /webm/;
      const codecs = file.type === 'video/mp4' ? ['h264', 'av1'] : ['vp8', 'vp9', 'av1'];
      if (!expected.test(probe.format?.format_name ?? '') || !codecs.includes(video.codec_name ?? '')) throw new BuddyError('Export an H.264 MP4 or VP8/VP9 WebM video.', 400);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_CLIP_SECONDS) throw new BuddyError('Video clips must be 60 seconds or shorter.', 400);
    } else {
      const codec = { 'image/jpeg': 'mjpeg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      if (video.codec_name !== codec) throw new BuddyError('The photo contents do not match its file type.', 400);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
  const id = randomUUID(); const storagePath = `${ownerId}/${id}.${extension}`;
  const storage = mediaStorage();
  const { error } = await storage.upload(storagePath, bytes, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) throw new BuddyError('Upload failed. Please try again.', 503);
  try {
    return await documentDatabase().mediaAsset.create({ data: { id, ownerId, storagePath, mimeType: file.type, bytes: bytes.length, durationSeconds } });
  } catch (error) { await storage.remove([storagePath]); throw error; }
}

export async function requireOwnedMedia(ownerId: string, ids: string[], type: 'image' | 'video') {
  if (!ids.length) return;
  if (new Set(ids).size !== ids.length) throw new BuddyError('Choose each file only once.', 400);
  const count = await documentDatabase().mediaAsset.count({ where: { id: { in: ids }, ownerId, mimeType: { startsWith: type + '/' } } });
  if (count !== ids.length) throw new BuddyError('Choose files uploaded to your own buddy account.', 400);
}

export async function mediaIsPublic(id: string) {
  const db = documentDatabase();
  const [pack, profile] = await Promise.all([
    db.experiencePackage.findFirst({ where: { published: true, owner: { data: { path: ['status'], equals: 'active' } }, OR: [
      { data: { path: ['videoIds'], array_contains: [id] } }, { data: { path: ['gallery'], array_contains: [mediaUrl(id)] } },
    ] }, select: { id: true } }),
    db.accountDocument.findFirst({ where: { AND: [
      { OR: [{ data: { path: ['profileVideoIds'], array_contains: [id] } }, { data: { path: ['avatarMediaId'], equals: id } }] }, { data: { path: ['status'], equals: 'active' } },
      { data: { path: ['onboarding'], equals: 'completed' } }, { data: { path: ['roles'], array_contains: ['provider'] } },
    ] }, select: { id: true } }),
  ]);
  return Boolean(pack || profile);
}
