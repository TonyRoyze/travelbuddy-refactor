import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthTestUser } from './auth-test-user';
import { documentDatabase } from '../src/lib/backend/database';
import { mediaStorage } from '../src/lib/backend/media';
import { emptyPackage } from '../src/lib/package-editor';
import { addDays, today } from '../src/lib/customer';
const require = createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());
async function main() {
  const origin = process.env.AUTH_APP_URL!;
  for (const value of [origin, process.env.SUPABASE_URL!]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) throw new Error('Inventory tests are restricted to localhost.');
  const db = documentDatabase(); const users: Awaited<ReturnType<typeof createAuthTestUser>>[] = []; const ids: string[] = [];
  const dir = await mkdtemp(join(tmpdir(), 'tb-inventory-'));
  const request = (path: string, cookie = '', body?: unknown, method?: string, requestOrigin = origin) => fetch(origin + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie, Origin: requestOrigin, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), redirect: 'manual',
  });
  const json = async (response: Response, status = 200) => { const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body; };
  async function user(type: 'buddy' | 'traveler') {
    const auth = await createAuthTestUser('Inventory integration'); users.push(auth);
    const account = (await json(await request('/api/auth/session', auth.cookie))).account; ids.push(account.id);
    await json(await request('/api/auth/onboarding', auth.cookie, { displayName: 'Inventory integration', acceptAccountCreation: true, accountType: type })); return auth;
  }
  try {
    const buddy = await user('buddy'); const first = await user('traveler'); const second = await user('traveler');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x0b6258:s=160x120', '-frames:v', '1', '-y', join(dir, 'photo.png')]);
    const bytes = await readFile(join(dir, 'photo.png'));
    const photoForm = () => { const form = new FormData(); form.set('file', new Blob([bytes], { type: 'image/png' }), 'photo.png'); return form; };
    assert.equal((await request('/api/account/photo', '', photoForm())).status, 401);
    assert.equal((await request('/api/account/photo', first.cookie, photoForm(), 'POST', 'https://evil.example')).status, 403);
    let avatar = (await json(await request('/api/account/photo', first.cookie, photoForm()))).account.avatarMediaId;
    assert.ok(avatar);
    assert.equal((await request(`/api/media/${avatar}`, first.cookie)).status, 307);
    assert.equal((await request(`/api/media/${avatar}`, second.cookie)).status, 404);
    const replaced = (await json(await request('/api/account/photo', first.cookie, photoForm()))).account.avatarMediaId;
    assert.notEqual(replaced, avatar); avatar = replaced;
    assert.equal((await json(await request('/api/auth/session', first.cookie))).account.avatarMediaId, avatar);
    await json(await request('/api/account/photo', first.cookie, undefined, 'DELETE'));
    assert.equal((await json(await request('/api/auth/session', first.cookie))).account.avatarMediaId, null);
    const invalidPhoto = new FormData(); invalidPhoto.set('file', new Blob(['bad file'], { type: 'image/png' }), 'bad.png');
    assert.equal((await request('/api/account/photo', first.cookie, invalidPhoto)).status, 400);
    const largePhoto = new FormData(); largePhoto.set('file', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    assert.equal((await request('/api/account/photo', first.cookie, largePhoto)).status, 413);
    const cover = (await json(await request('/api/media', buddy.cookie, photoForm()), 201)).media.id;
    const day = addDays(today(), 3); const closed = addDays(today(), 4); const special = addDays(today(), 5);
    const input = { ...emptyPackage(), title: `Inventory test ${Date.now()}`, destination: 'Ella', country: 'Sri Lanka', description: 'A guided morning walk with a local buddy through beautiful tea country.', meetingPoint: 'Ella station', imageIds: [cover], published: true,
      options: [{ name: 'Morning walk', price: 25.5, capacity: 3, times: ['09:00'] }],
      schedule: { startDate: today(), endDate: addDays(today(), 30), weekdays: [0, 1, 2, 3, 4, 5, 6], exceptions: [{ date: closed, closed: true }, { date: special, closed: false, capacity: 2, times: ['13:00'] }] },
    };
    let pack = (await json(await request('/api/buddy/packages', buddy.cookie, input), 201)).package;
    // Package chats use the persisted owner, remain private, and need no booking.
    const publicPackage = await json(await request(`/api/packages/${pack.id}`));
    assert.equal(publicPackage.chatAvailable, true);
    assert.equal(publicPackage.providerId, ids[0]);
    const startChat = () => request('/api/messages', first.cookie, { packageId: pack.id });
    assert.equal((await request('/api/messages', '', { packageId: pack.id })).status, 401);
    assert.equal((await request('/api/messages', first.cookie, { packageId: pack.id }, 'POST', 'https://evil.example')).status, 403);
    assert.equal((await request('/api/messages', buddy.cookie, { packageId: pack.id })).status, 409);
    assert.equal((await request('/api/messages', first.cookie, { packageId: pack.id, recipientId: ids[2] })).status, 400);
    const chats = await Promise.all([startChat(), startChat()]);
    const chat = (await json(chats[0], 201)).conversation;
    assert.equal((await json(chats[1], 201)).conversation.id, chat.id, 'Concurrent starts reuse the package thread');
    const detail = (await json(await request(`/api/messages/${chat.id}`, first.cookie))).conversation;
    assert.equal(detail.package.id, pack.id);
    assert.equal(detail.participant.id, ids[0], 'The persisted package owner is the recipient');
    assert.equal((await request(`/api/messages/${chat.id}`, second.cookie)).status, 404);
    await json(await request(`/api/messages/${chat.id}`, first.cookie, { body: 'Can we meet at Ella station before booking?' }), 201);
    const hostChat = (await json(await request(`/api/messages/${chat.id}`, buddy.cookie))).conversation;
    assert.equal(hostChat.messages[0].body, 'Can we meet at Ella station before booking?');
    await json(await request(`/api/messages/${chat.id}`, buddy.cookie, { body: 'Yes, that meeting point works.' }), 201);
    assert.ok((await json(await request('/api/messages', buddy.cookie))).conversations.some((value: { id: string; package: { id: string } }) => value.id === chat.id && value.package.id === pack.id));
    assert.equal((await json(await request('/api/bookings', first.cookie))).bookings.length, 0, 'Chat does not create a booking');
    const otherPackage = (await json(await request('/api/buddy/packages', buddy.cookie, { ...input, title: 'Another package for chat isolation' }), 201)).package;
    const otherChat = (await json(await request('/api/messages', first.cookie, { packageId: otherPackage.id }), 201)).conversation;
    assert.notEqual(otherChat.id, chat.id, 'Different packages have separate threads with the same host');
    await db.experiencePackage.update({ where: { id: otherPackage.id }, data: { ownerId: null } });
    assert.equal((await json(await request(`/api/packages/${otherPackage.id}`))).chatAvailable, false);
    assert.equal((await request('/api/messages', first.cookie, { packageId: otherPackage.id })).status, 409, 'Ownerless catalog listings do not invent a recipient');
    await db.experiencePackage.delete({ where: { id: otherPackage.id } });
    const availability = async (date = day) => json(await request(`/api/packages/${pack.id}/availability?date=${date}&option=0`));
    assert.equal((await availability()).slots[0].remaining, 3);
    assert.equal((await availability(closed)).slots.length, 0);
    assert.deepEqual((await availability(special)).slots, [{ time: '13:00', capacity: 2, remaining: 2 }]);
    const checkout = (travelers: number, date = day, time = '09:00') => ({ idempotencyKey: randomUUID(), travelerName: 'Test Traveller', travelerEmail: 'traveler@example.test', items: [{ id: randomUUID(), experienceId: pack.id, option: 0, date, time, travelers }] });
    assert.equal((await request('/api/bookings', '', checkout(1))).status, 401);
    assert.equal((await request('/api/bookings', first.cookie, checkout(1), 'POST', 'https://evil.example')).status, 403);
    assert.equal((await request('/api/bookings', buddy.cookie, checkout(1))).status, 400, 'Hosts cannot book their own package');
    assert.equal((await request('/api/bookings', first.cookie, checkout(1, closed))).status, 409);
    assert.equal((await request('/api/bookings', first.cookie, checkout(1, day, '11:00'))).status, 409);
    assert.equal((await request('/api/bookings', first.cookie, checkout(1, addDays(today(), -1)))).status, 409);
    assert.equal((await request('/api/bookings', first.cookie, checkout(1, '2026-02-30'))).status, 400);
    const attempts = [checkout(2), checkout(2)];
    const raced = await Promise.all([request('/api/bookings', first.cookie, attempts[0]), request('/api/bookings', second.cookie, attempts[1])]);
    assert.deepEqual(raced.map(response => response.status).sort(), [201, 409], 'Concurrent checkouts must not overbook');
    const winnerIndex = raced.findIndex(response => response.status === 201); const winner = winnerIndex ? second : first; const loser = winnerIndex ? first : second;
    const booked = (await raced[winnerIndex].json()).bookings[0]; assert.equal(booked.total, 51);
    assert.equal((await availability()).slots[0].remaining, 1);
    const replay = (await json(await request('/api/bookings', winner.cookie, attempts[winnerIndex]), 201)).bookings[0]; assert.equal(replay.id, booked.id);
    assert.equal((await request('/api/bookings', winner.cookie, { ...attempts[winnerIndex], travelerName: 'Changed name' })).status, 409);
    assert.equal((await json(await request('/api/bookings', winner.cookie))).bookings.length, 1);
    assert.equal((await json(await request('/api/bookings', loser.cookie))).bookings.length, 0);
    pack = (await json(await request(`/api/buddy/packages/${pack.id}`, buddy.cookie, { ...pack.input, published: false }, 'PATCH'))).package;
    assert.equal((await startChat()).status, 404);
    assert.equal((await request(`/api/messages/${chat.id}`, first.cookie)).status, 200, 'Unpublishing retains existing chat history');
    assert.equal((await request(`/api/media/${cover}`, winner.cookie)).status, 307, 'Booked travellers retain access to their booking photos after unpublishing');
    assert.equal((await request(`/api/media/${cover}`, loser.cookie)).status, 404);
    assert.equal((await request(`/api/media/${cover}`)).status, 404);
    pack = (await json(await request(`/api/buddy/packages/${pack.id}`, buddy.cookie, { ...pack.input, published: true }, 'PATCH'))).package;
    assert.equal((await request(`/api/bookings/${booked.id}/cancel`, loser.cookie, {})).status, 404);
    const rollback = checkout(1); rollback.items.push({ ...rollback.items[0], id: randomUUID(), travelers: 2 });
    assert.equal((await request('/api/bookings', loser.cookie, rollback)).status, 409);
    assert.equal((await availability()).slots[0].remaining, 1, 'A failed multi-item checkout must roll back every reservation');
    const host = await json(await request(`/api/buddy/packages/${pack.id}/reservations`, buddy.cookie)); assert.equal(host.reservations[0].travelers, 2);
    assert.equal((await request(`/api/buddy/packages/${pack.id}/reservations`, loser.cookie)).status, 403);
    const blockBooked = { ...pack.input, schedule: { ...pack.input.schedule, exceptions: [...pack.input.schedule.exceptions, { date: day, closed: true }] } };
    assert.equal((await request(`/api/buddy/packages/${pack.id}`, buddy.cookie, blockBooked, 'PATCH')).status, 409);
    const reduce = { ...pack.input, options: [{ ...pack.input.options[0], capacity: 1 }] };
    assert.equal((await request(`/api/buddy/packages/${pack.id}`, buddy.cookie, reduce, 'PATCH')).status, 409);
    const last = (await json(await request('/api/bookings', loser.cookie, checkout(1)), 201)).bookings[0];
    const soldOut = await availability();
    assert.equal(soldOut.slots[0].remaining, 0);
    assert.deepEqual(soldOut.next, { date: special, time: '13:00' }, 'Next available skips sold-out and closed dates');
    const soldOutSearch = await json(await request(`/api/packages?q=${encodeURIComponent(pack.input.title)}&date=${day}`)); assert.equal(soldOutSearch.total, 0);
    await json(await request(`/api/bookings/${booked.id}/cancel`, winner.cookie, {}));
    await json(await request(`/api/bookings/${booked.id}/cancel`, winner.cookie, {}));
    assert.equal((await availability()).slots[0].remaining, 2, 'Repeated cancellation must release places once');
    const search = await json(await request(`/api/packages?q=${encodeURIComponent(pack.input.title)}&date=${day}`)); assert.equal(search.total, 1);
    await json(await request(`/api/bookings/${last.id}/cancel`, loser.cookie, {}));
    pack = (await json(await request(`/api/buddy/packages/${pack.id}`, buddy.cookie, blockBooked, 'PATCH'))).package;
    assert.equal((await availability()).slots.length, 0, 'A date may close after its bookings are cancelled');
    // Private tables must remain inaccessible through anonymous/authenticated DB roles.
    const permissions = await db.$queryRaw<{ relrowsecurity: boolean; anon_read: boolean; auth_read: boolean }[]>`SELECT c.relrowsecurity, has_table_privilege('anon', c.oid, 'SELECT') AS anon_read, has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_read FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'travelbuddy_backend' AND c.relname IN ('booking_orders', 'scheduled_bookings')`;
    assert.equal(permissions.length, 2); assert.ok(permissions.every(row => row.relrowsecurity && !row.anon_read && !row.auth_read));
    console.log('Package provider chats passed: owner resolution, concurrent thread reuse, package isolation, private messages, no booking side effects, unavailable hosts and retained history.');
    console.log('Profile photos and live inventory passed: upload/replace/remove/persistence, ownership, schedules, exceptions, atomic concurrent bookings, idempotency, rollback, cancellation, live search, schedule protection, and private-table permissions.');
  } finally {
    try {
      await db.bookingOrder.deleteMany({ where: { travelerId: { in: ids } } });
      const media = await db.mediaAsset.findMany({ where: { ownerId: { in: ids } } });
      if (media.length) { const result = await mediaStorage().remove(media.map(row => row.storagePath)); if (result.error) throw result.error; }
      await db.accountDocument.deleteMany({ where: { id: { in: ids } } });
    } finally { for (const auth of users) await auth.remove(); await rm(dir, { recursive: true, force: true }); await db.$disconnect(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
