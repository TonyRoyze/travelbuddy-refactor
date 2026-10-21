import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import type {
  LiveResults,
  ProviderDiscovery,
} from "../src/features/nearby/types";
function envFile(text: string) {
  return Object.fromEntries(
    text
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index),
          line.slice(index + 1).replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}
const legacy = process.env.LEGACY_CHECKOUT ?? resolve("../travelbuddy");
const env = {
  ...envFile(await readFile(join(legacy, ".env.local"), "utf8")),
  ...process.env,
};
const url = env.SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("HTTP fixtures are restricted to local Supabase.");
const admin = createClient(url, env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = () =>
  createClient<Database, "travelbuddy_api">(
    url,
    env.SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "travelbuddy_api" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
function sql(input: string) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
type FixtureUser = {
  id: string;
  accountId: string;
  email: string;
  password: string;
};
type Fixture = {
  tag: string;
  area: string;
  packages: string[];
  users: FixtureUser[];
};
async function cleanup(fixture: Fixture) {
  for (const user of fixture.users) {
    const check = await admin.auth.admin.getUserById(user.id);
    if (check.data.user && check.data.user.email !== user.email)
      throw new Error("Fixture identity mismatch");
  }
  // Remove fixture travellers' reservations before deleting provider-owned packages.
  for (const user of fixture.users) {
    sql(`DELETE FROM travelbuddy_backend.scheduled_bookings WHERE order_id IN(SELECT id FROM travelbuddy_backend.booking_orders WHERE traveler_id=${literal(user.accountId)}::uuid);
      DELETE FROM travelbuddy_backend.booking_orders WHERE traveler_id=${literal(user.accountId)}::uuid;`);
  }
  for (const user of fixture.users) {
    const paths = JSON.parse(
      sql(
        `SELECT coalesce(json_agg(storage_path),'[]') FROM travelbuddy_backend.media_assets WHERE owner_id=${literal(user.accountId)}::uuid`,
      ),
    ) as string[];
    if (paths.length) {
      const removed = await admin.storage.from("buddy-media").remove(paths);
      if (removed.error) throw removed.error;
    }
    sql(
      `DELETE FROM travelbuddy_backend.accounts WHERE supabase_user_id=${literal(user.id)}::uuid AND id=${literal(user.accountId)}::uuid`,
    );
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) throw removed.error;
  }
}
const cleanupIndex = process.argv.indexOf("--cleanup");
if (cleanupIndex >= 0) {
  const path = resolve(process.argv[cleanupIndex + 1]);
  if (!path.startsWith(join(tmpdir(), "travelbuddy-nearby-http-")))
    throw new Error("Use a generated local fixture file");
  await cleanup(JSON.parse(await readFile(path, "utf8")) as Fixture);
  await rm(dirname(path), { recursive: true });
  console.log("Nearby HTTP fixtures cleaned.");
} else {
  const tag = randomBytes(6).toString("hex");
  const fixture: Fixture = {
    tag,
    area: `QA Ella ${tag}`,
    packages: [],
    users: [],
  };
  let keep = false;
  try {
    async function user(role: "buddy" | "traveler") {
      const email = `nearby-qa-${role}-${tag}@example.test`,
        password = randomBytes(32).toString("base64url");
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      const record: FixtureUser = {
        id: created.data.user.id,
        accountId: randomUUID(),
        email,
        password,
      };
      fixture.users.push(record);
      const app = client();
      const login = await app.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      const account = await app.rpc("account");
      if (account.error) throw account.error;
      const current = account.data as { id: string; revision: number };
      record.accountId = current.id;
      const onboard = await app.rpc("onboard", {
        display_name: `QA ${role} ${tag}`,
        account_type: role,
        expected_revision: current.revision,
      });
      if (onboard.error) throw onboard.error;
      return app;
    }
    const host = await user("buddy"),
      traveler = await user("traveler"),
      anonymous = client();
    for (let index = 0; index < 3; index++) {
      const id = `nearby-qa-${tag}-${index}`;
      fixture.packages.push(id);
      sql(`INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
        SELECT ${literal(id)},${literal(fixture.users[0].accountId)}::uuid,${literal(`QA Tea walk ${index + 1}`)},'Ella',country,category,25.55,rating,duration_minutes,duration,true,true,
        data||${literal(JSON.stringify({ id, title: `QA Tea walk ${index + 1}`, price: 25.55, supplier: `QA Buddy ${tag}`, meetingPoint: "Ella railway station", options: [{ name: "Morning walk", price: 25.55, duration: "2 hours", detail: "Small group", times: ["09:00", "11:00"], capacity: 5 }] }))}::jsonb,schedule,now() FROM travelbuddy_backend.packages WHERE id NOT LIKE 'nearby-qa-%' LIMIT 1;`);
      const saved = await host.rpc("save_meeting_point", {
        input: {
          packageId: id,
          area: index < 2 ? fixture.area : `QA Kandy ${tag}`,
          label: "Ella railway station",
          latitude: 6.8734,
          longitude: 81.0464,
        },
      });
      if (saved.error) throw saved.error;
    }
    assert.ok(
      (
        await traveler.rpc("set_provider_accepting", {
          accepting_requests: true,
        })
      ).error,
      "Travelers cannot go live",
    );
    const offline = await anonymous.rpc("nearby_live", {
      area_name: fixture.area,
    });
    assert.equal((offline.data as unknown as LiveResults).items.length, 0);
    const online = await host.rpc("set_provider_accepting", {
      accepting_requests: true,
    });
    if (online.error) throw online.error;
    const live = await anonymous.rpc("nearby_live", {
      area_name: fixture.area.toUpperCase(),
    });
    if (live.error) throw live.error;
    assert.equal(
      (live.data as unknown as LiveResults).items.length,
      2,
      "Same town, two experiences with shared point",
    );
    const areas = await anonymous.rpc("nearby_areas");
    assert.ok((areas.data as string[]).includes(fixture.area));
    const forbidden = await traveler.rpc("save_meeting_point", {
      input: {
        packageId: fixture.packages[0],
        area: "Wrong",
        label: "Wrong",
        latitude: 6,
        longitude: 80,
      },
    });
    assert.ok(forbidden.error);
    sql(
      `UPDATE travelbuddy_private.provider_presence SET last_seen=clock_timestamp()-interval '3 minutes' WHERE provider_id=${literal(fixture.users[0].accountId)}::uuid`,
    );
    assert.equal(
      (
        (await anonymous.rpc("nearby_live", { area_name: fixture.area }))
          .data as unknown as LiveResults
      ).items.length,
      0,
      "Closed app expires",
    );
    assert.ok(!(await host.rpc("provider_heartbeat")).error);
    const discovery = await host.rpc("provider_discovery");
    assert.equal(
      (discovery.data as unknown as ProviderDiscovery).packages.length,
      3,
    );
    const before = await traveler.rpc("bookings");
    const chat = await traveler.rpc("start_chat", {
      package_id: fixture.packages[0],
    });
    if (chat.error) throw chat.error;
    assert.equal(
      (await traveler.rpc("start_chat", { package_id: fixture.packages[0] }))
        .data,
      chat.data,
    );
    assert.deepEqual(
      (await traveler.rpc("bookings")).data,
      before.data,
      "Chat creates no reservation",
    );
    console.log(
      "Nearby HTTP checks passed: real Auth, provider setup, saved locations, town filtering, online expiry/renewal, ownership and chat without booking.",
    );
    if (process.argv.includes("--keep-fixtures")) {
      const dir = await mkdtemp(join(tmpdir(), "travelbuddy-nearby-http-"));
      const path = join(dir, "fixture.json");
      await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
      keep = true;
      console.log(`Fixture file: ${path}`);
    }
  } finally {
    if (!keep) await cleanup(fixture);
  }
}
