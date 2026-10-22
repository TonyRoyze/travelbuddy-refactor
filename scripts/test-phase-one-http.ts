// Reuses disposable local identities from test-nearby-http.ts --keep-fixtures.
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import type { Account } from "../src/features/account/types";
import type { Availability, Catalog } from "../src/features/catalog/types";
import type { Booking } from "../src/features/bookings/types";
loadEnvFile(".env.media.local");
const url = process.env.SUPABASE_URL!;
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
  "Local Supabase only",
);
const path = process.argv[2];
const fixture = JSON.parse(await readFile(path, "utf8")) as {
  tag: string;
  area: string;
  packages: string[];
  users: { id: string; accountId: string; email: string; password: string }[];
};
const options = {
  db: { schema: "travelbuddy_api" as const },
  auth: { persistSession: false, autoRefreshToken: false },
};
const make = () =>
  createClient<Database, "travelbuddy_api">(
    url,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    options,
  );
const host = make(),
  traveler = make(),
  anon = make();
for (const [i, c] of [host, traveler].entries()) {
  const r = await c.auth.signInWithPassword(fixture.users[i]);
  assert.ifError(r.error);
}
// Exercise real self-registration. Confirmation is performed locally when required.
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const registration = make(),
  email = `phase-one-${fixture.tag}@example.test`,
  password = randomBytes(32).toString("base64url");
const signup = await registration.auth.signUp({ email, password });
assert.ifError(signup.error);
assert.ok(signup.data.user);
if (!signup.data.session) {
  assert.ifError(
    (
      await admin.auth.admin.updateUserById(signup.data.user.id, {
        email_confirm: true,
      })
    ).error,
  );
  assert.ifError(
    (await registration.auth.signInWithPassword({ email, password })).error,
  );
}
const a = await registration.rpc("account");
assert.ifError(a.error);
const account = a.data as unknown as Account;
fixture.users.push({
  id: signup.data.user.id,
  accountId: account.id,
  email,
  password,
});
await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
assert.equal(account.onboarding, "pending");
const onboard = await registration.rpc("onboard", {
  display_name: "Phase One Traveller",
  account_type: "traveler",
  expected_revision: account.revision,
});
assert.ifError(onboard.error);
const registered = (await registration.rpc("account"))
  .data as unknown as Account;
const profile = await registration.rpc("save_profile", {
  input: {
    displayName: "Phase One Traveller",
    profileDetails: {
      ...registered.profileDetails,
      bio: "I enjoy tea trails and local food.",
      homeBase: "Colombo",
    },
  },
  expected_revision: registered.revision,
});
assert.ifError(profile.error);
assert.equal(
  (profile.data as unknown as Account).profileDetails.bio,
  "I enjoy tea trails and local food.",
);
const before = (await traveler.rpc("bookings")).data;
const chat = await traveler.rpc("start_chat", {
  package_id: fixture.packages[0],
});
assert.ifError(chat.error);
assert.equal(
  (await traveler.rpc("start_chat", { package_id: fixture.packages[0] })).data,
  chat.data,
);
assert.deepEqual(
  (await traveler.rpc("bookings")).data,
  before,
  "Chat never reserves inventory",
);
assert.ifError(
  (
    await traveler.rpc("send_message", {
      conversation_id: chat.data!,
      body: "Can we discuss a meeting point before booking?",
    })
  ).error,
);
assert.ifError(
  (
    await host.rpc("send_message", {
      conversation_id: chat.data!,
      body: "Yes, we can meet at the station entrance.",
    })
  ).error,
);
assert.equal(
  (
    (await traveler.rpc("messages", { conversation_id: chat.data! }))
      .data as unknown[]
  ).length,
  2,
);
const search = { q: `QA Tea walk`, destination: "Ella", live: true };
assert.ifError(
  (await host.rpc("set_provider_accepting", { accepting_requests: false }))
    .error,
);
assert.equal(
  (
    (await anon.rpc("catalog", { filters: search })).data as unknown as Catalog
  ).items.filter((p) => fixture.packages.includes(p.id)).length,
  0,
);
assert.ifError(
  (await host.rpc("set_provider_accepting", { accepting_requests: true }))
    .error,
);
const online = await anon.rpc("catalog", { filters: search });
assert.ifError(online.error);
assert.equal(
  (online.data as unknown as Catalog).items.filter((p) =>
    fixture.packages.includes(p.id),
  ).length,
  3,
);
// Choose a date safely beyond the cancellation cutoff, using real availability.
let day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  time = "";
for (let i = 0; i < 7; i++) {
  const r = await anon.rpc("availability", {
    package_id: fixture.packages[0],
    day,
    option_index: 0,
    travelers: 2,
  });
  assert.ifError(r.error);
  const availability = r.data as unknown as Availability;
  if (availability.slots.length) {
    time = availability.slots[0].time;
    break;
  }
  day = new Date(Date.parse(day + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
}
assert.ok(time);
const request = {
  idempotencyKey: randomUUID(),
  travelerName: "Phase One Guest",
  travelerEmail: fixture.users[1].email,
  items: fixture.packages.slice(0, 2).map((experienceId) => ({
    id: randomUUID(),
    experienceId,
    date: day,
    time,
    option: 0,
    travelers: 2,
  })),
};
const first = await traveler.rpc("checkout", { input: request });
assert.ifError(first.error);
const bookings = first.data as unknown as Booking[];
assert.equal(bookings.length, 2);
assert.ok(bookings.every((b) => b.status === "Upcoming" && b.total === 51.1));
const retry = await traveler.rpc("checkout", { input: request });
assert.ifError(retry.error);
assert.deepEqual(
  retry.data,
  first.data,
  "Duplicate submission replays the same reservations",
);
assert.equal(
  ((await traveler.rpc("bookings")).data as unknown as Booking[]).length,
  2,
);
assert.equal(
  ((await host.rpc("bookings")).data as unknown as Booking[]).length,
  0,
  "Booking history is private",
);
assert.ok(
  (await registration.rpc("cancel_booking", { booking_id: bookings[0].id }))
    .error,
  "Another traveller cannot cancel",
);
assert.ifError(
  (await traveler.rpc("cancel_booking", { booking_id: bookings[0].id })).error,
);
assert.ok(
  ((await traveler.rpc("bookings")).data as unknown as Booking[]).some(
    (b) => b.id === bookings[0].id && b.status === "Cancelled",
  ),
);
console.log(
  "Phase 1 HTTP passed: self-registration, onboarding, profile persistence, chat/replies without reservations, live/offline catalog, multi-item checkout, duplicate replay, private history and cancellation.",
);
