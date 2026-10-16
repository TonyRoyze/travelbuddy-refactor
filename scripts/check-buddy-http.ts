import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthTestUser } from './auth-test-user';
import { documentDatabase } from '../src/lib/backend/database';
import { mediaStorage } from '../src/lib/backend/media';
import { emptyPackage, MAX_CLIP_BYTES } from '../src/lib/package-editor';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());

async function main() {
  const origin = process.env.AUTH_APP_URL!;
  for (const value of [origin, process.env.SUPABASE_URL!]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error('Buddy HTTP integration is restricted to localhost.');
  const db = documentDatabase(); const dir = await mkdtemp(join(tmpdir(), 'tb-buddy-test-'));
  const users: Awaited<ReturnType<typeof createAuthTestUser>>[] = []; const accountIds: string[] = [];
  const paths: string[] = [];
  async function request(path: string, cookie = '', body?: unknown, method?: string, requestOrigin = origin) {
    return fetch(origin + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie, Origin: requestOrigin, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), redirect: 'manual' });
  }
  async function makeUser(type: 'buddy' | 'traveler') {
    const auth = await createAuthTestUser('Buddy editor integration'); users.push(auth);
    const session = await request('/api/auth/session', auth.cookie); assert.equal(session.status, 200);
    const account = (await session.json()).account; accountIds.push(account.id);
    const response = await request('/api/auth/onboarding', auth.cookie, { displayName: 'Buddy editor integration', acceptAccountCreation: true, accountType: type });
    assert.equal(response.status, 200, await response.text()); return auth;
  }
  async function upload(cookie: string, bytes: Uint8Array, mime: string) {
    const form = new FormData(); form.set('file', new Blob([bytes as BlobPart], { type: mime }), 'upload');
    return request('/api/media', cookie, form);
  }
  try {
    const owner = await makeUser('buddy'); const other = await makeUser('buddy'); const traveler = await makeUser('traveler');
    assert.equal((await request('/api/buddy/packages')).status, 401);
    assert.equal((await request('/api/buddy/packages', traveler.cookie)).status, 403);
    assert.equal((await request('/api/buddy/packages', traveler.cookie, emptyPackage())).status, 403);
    assert.equal((await request('/api/buddy/packages', owner.cookie, emptyPackage(), 'POST', 'https://evil.example')).status, 403);
    const ffmpeg = (output: string, seconds: string, codec: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x0b6258:s=160x120:r=1', '-t', seconds, ...codec, '-y', join(dir, output)]);
    ffmpeg('short.mp4', '2', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
    ffmpeg('long.mp4', '61', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
    ffmpeg('cover.png', '1', ['-frames:v', '1']);
    const short = await readFile(join(dir, 'short.mp4')); const cover = await readFile(join(dir, 'cover.png'));
    assert.equal((await upload(traveler.cookie, short, 'video/mp4')).status, 403);
    assert.equal((await upload(owner.cookie, new TextEncoder().encode('not a video'), 'video/mp4')).status, 400);
    assert.equal((await upload(owner.cookie, cover, 'video/mp4')).status, 400, 'MIME spoofing must be rejected');
    assert.equal((await upload(owner.cookie, await readFile(join(dir, 'long.mp4')), 'video/mp4')).status, 400, 'Videos over 60 seconds must be rejected on the server');
    assert.equal((await upload(owner.cookie, new Uint8Array(MAX_CLIP_BYTES + 1), 'video/mp4')).status, 413);
    const videoUpload = await upload(owner.cookie, short, 'video/mp4'); assert.equal(videoUpload.status, 201, await videoUpload.clone().text());
    const video = (await videoUpload.json()).media; assert.ok(video.durationSeconds <= 60);
    const photoUpload = await upload(owner.cookie, cover, 'image/png'); assert.equal(photoUpload.status, 201, await photoUpload.clone().text());
    const photo = (await photoUpload.json()).media;
    assert.equal((await request(`/api/media/${video.id}`)).status, 404, 'Unattached clips must remain private');
    assert.equal((await request(`/api/media/${video.id}`, other.cookie)).status, 404);
    const ownMedia = await request(`/api/media/${video.id}`, owner.cookie); assert.equal(ownMedia.status, 307);
    const download = await fetch(ownMedia.headers.get('location')!, { headers: { Range: 'bytes=0-31' } });
    assert.equal(download.status, 206, 'Playback must support byte ranges'); await download.arrayBuffer();
    const draft = { ...emptyPackage(), title: `Test local walk ${Date.now()}`, imageIds: [photo.id], videoIds: [video.id] };
    const create = await request('/api/buddy/packages', owner.cookie, draft); assert.equal(create.status, 201, await create.clone().text());
    let saved = (await create.json()).package;
    assert.equal((await request(`/api/buddy/packages/${saved.id}`, other.cookie)).status, 404);
    assert.equal((await request(`/api/buddy/packages/${saved.id}`, other.cookie, saved.input, 'PATCH')).status, 404);
    assert.equal((await request('/api/buddy/packages', other.cookie, draft)).status, 400, 'Another buddy cannot attach these files');
    const publicDraft = await request(`/experience/${saved.id}`);
    const draftHtml = await publicDraft.text();
    assert.ok(publicDraft.status === 404 || draftHtml.includes('NEXT_NOT_FOUND'));
    assert.equal(draftHtml.includes(draft.title), false, 'Draft content must never be rendered publicly');
    const missingFields = await request(`/api/buddy/packages/${saved.id}`, owner.cookie, { ...saved.input, published: true }, 'PATCH'); assert.equal(missingFields.status, 400);
    const complete = { ...saved.input, destination: 'Ella', description: 'An easy local walk through tea country with a knowledgeable buddy.', meetingPoint: 'Ella railway station', published: true };
    const publish = await request(`/api/buddy/packages/${saved.id}`, owner.cookie, complete, 'PATCH'); assert.equal(publish.status, 200, await publish.clone().text());
    saved = (await publish.json()).package;
    assert.equal((await request(`/api/buddy/packages/${saved.id}`, owner.cookie, complete, 'PATCH')).status, 409, 'Stale editors cannot overwrite changes');
    const listing = await request(`/experience/${saved.id}`); assert.equal(listing.status, 200); assert.match(await listing.text(), /A glimpse of the experience/);
    const search = await request(`/api/packages?q=${encodeURIComponent(draft.title)}`); assert.equal(search.status, 200); assert.equal((await search.json()).packages[0].id, saved.id);
    assert.equal((await request(`/api/media/${video.id}`)).status, 307);
    const ownerRecord = await db.accountDocument.findUniqueOrThrow({ where: { id: accountIds[0] } });
    const ownerData = ownerRecord.data as Record<string, unknown>;
    await db.accountDocument.update({ where: { id: ownerRecord.id }, data: { data: { ...ownerData, status: 'suspended' } } });
    try {
      const hidden = await request(`/api/packages?q=${encodeURIComponent(draft.title)}`);
      assert.equal((await hidden.json()).total, 0, 'Suspended buddies must disappear from package search');
      assert.equal((await request(`/api/media/${video.id}`)).status, 404);
      assert.equal((await request('/api/buddy/packages', owner.cookie)).status, 401);
    } finally { await db.accountDocument.update({ where: { id: ownerRecord.id }, data: { data: ownerRecord.data! } }); }
    const unpublish = await request(`/api/buddy/packages/${saved.id}`, owner.cookie, { ...saved.input, published: false }, 'PATCH'); assert.equal(unpublish.status, 200);
    assert.equal((await request(`/api/media/${video.id}`)).status, 404);
    const ownerSession = (await (await request('/api/auth/session', owner.cookie)).json()).account;
    assert.equal((await request('/api/account/videos', other.cookie, { videoIds: [video.id], revision: ownerSession.revision }, 'PATCH')).status, 400);
    const attach = await request('/api/account/videos', owner.cookie, { videoIds: [video.id], revision: ownerSession.revision }, 'PATCH'); assert.equal(attach.status, 200);
    assert.equal((await request(`/api/media/${video.id}`)).status, 307);
    const profile = await request(`/buddy/${ownerSession.id}`); assert.equal(profile.status, 200); assert.match(await profile.text(), /on video/);
    const current = (await attach.json()).revision;
    assert.equal((await request('/api/account/videos', owner.cookie, { videoIds: [], revision: current }, 'PATCH')).status, 200);
    assert.equal((await request(`/api/media/${video.id}`)).status, 404, 'Removing a profile clip must remove public access');
    console.log('Buddy HTTP checks passed: role/origin protection, real photo/video uploads, byte-range playback, invalid/long/oversize files, ownership, private drafts, publish/search/unpublish, stale edits, profile clips, and removal.');
  } finally {
    try {
      const media = await db.mediaAsset.findMany({ where: { ownerId: { in: accountIds } } }); paths.push(...media.map(item => item.storagePath));
      if (paths.length) { const cleanup = await mediaStorage().remove(paths); assert.equal(cleanup.error, null); }
      await db.accountDocument.deleteMany({ where: { id: { in: accountIds } } });
    } finally { for (const user of users) await user.remove(); await rm(dir, { recursive: true, force: true }); await db.$disconnect(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
