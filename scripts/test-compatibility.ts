// Requires the original sibling checkout solely to verify the migration boundary.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const legacy =
  process.env.LEGACY_CHECKOUT ??
  new URL("../../travelbuddy/", import.meta.url).pathname;
function sql(input: string) {
  const r = spawnSync(
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
      "travelbuddy_refactor_test",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
async function main() {
  const env = Object.fromEntries(
    readFileSync(legacy + "/.env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return [k, v.join("=").replace(/^["']|["']$/g, "")];
      }),
  );
  const url = new URL(env.DOCUMENT_DATABASE_URL);
  url.pathname = "/travelbuddy_refactor_test";
  process.env.DOCUMENT_DATABASE_URL = url.toString();
  sql(
    "GRANT USAGE ON SCHEMA travelbuddy_backend TO travelbuddy_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA travelbuddy_backend TO travelbuddy_app;",
  );
  const { reserveBookings, cancelReservation, travelerBookings } = await import(
    pathToFileURL(legacy + "/src/lib/backend/inventory.ts").href
  );
  const { startPackageConversation, sendMessage } = await import(
    pathToFileURL(legacy + "/src/lib/backend/message-commands.ts").href
  );
  const { documentDatabase } = await import(
    pathToFileURL(legacy + "/src/lib/backend/database.ts").href
  );
  const fixture = readFileSync("supabase/tests/api.sql", "utf8").split(
    "SET LOCAL ROLE anon;",
  )[0];
  const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    traveler = "11111111-1111-4111-8111-111111111111";
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const input = () => ({
    idempotencyKey: randomUUID(),
    travelerName: "Maya Traveler",
    travelerEmail: "maya@example.com",
    items: [
      {
        id: randomUUID(),
        experienceId: "refactor-test-pack",
        option: 0,
        date: day,
        time: "23:59",
        travelers: 2,
      },
    ],
  });
  const rpc = (name: string, args: string) =>
    sql(
      `BEGIN; SELECT set_config('request.jwt.claim.sub','${uid}',true); SET LOCAL ROLE authenticated; SELECT travelbuddy_api.${name}(${args}); COMMIT;`,
    )
      .split("\n")
      .at(-1)!;
  try {
    sql(fixture + "COMMIT;");
    const first = input();
    const created = JSON.parse(
      rpc("checkout", `'${JSON.stringify(first)}'::jsonb`),
    );
    const old = await reserveBookings(traveler, first);
    assert.equal(old[0].id, created[0].id);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ ...first, idempotencyKey: undefined }))
      .digest("hex");
    assert.equal(
      sql(
        `SELECT fingerprint FROM travelbuddy_backend.booking_orders WHERE id='${created[0].orderId}'`,
      ),
      fingerprint,
    );
    assert.equal((await travelerBookings(traveler))[0].id, created[0].id);
    await cancelReservation(traveler, created[0].id);
    // Old and new writers race for the same last two places.
    const left = input(),
      right = input();
    const legacyWrite = reserveBookings(traveler, left);
    let apiSucceeded = false;
    try {
      rpc("checkout", `'${JSON.stringify(right)}'::jsonb`);
      apiSucceeded = true;
    } catch (e) {
      assert.match(String(e), /Not enough places/);
    }
    let legacySucceeded = false;
    try {
      await legacyWrite;
      legacySucceeded = true;
    } catch (e) {
      assert.match(String(e), /places remain/);
    }
    assert.equal(Number(apiSucceeded) + Number(legacySucceeded), 1);
    assert.equal(
      Number(
        sql(
          "SELECT sum(travelers) FROM travelbuddy_backend.scheduled_bookings WHERE package_id='refactor-test-pack' AND status='confirmed'",
        ),
      ),
      2,
    );
    const oldThread = await startPackageConversation(
      traveler,
      "refactor-test-pack",
    );
    const newThread = rpc("start_chat", "'refactor-test-pack'");
    assert.equal(oldThread.id, newThread);
    await sendMessage(traveler, newThread, "Message from the original server");
    assert.equal(
      JSON.parse(rpc("messages", `'${newThread}'::uuid`))[0].body,
      "Message from the original server",
    );
    console.log(
      "Legacy/new checkout fingerprint, replay, cancellation, capacity race, chat reuse and message compatibility passed.",
    );
  } finally {
    sql(
      "DELETE FROM travelbuddy_backend.messages WHERE conversation_id IN (SELECT id FROM travelbuddy_backend.conversations WHERE package_id='refactor-test-pack'); DELETE FROM travelbuddy_backend.conversations WHERE package_id='refactor-test-pack'; DELETE FROM travelbuddy_backend.scheduled_bookings WHERE package_id='refactor-test-pack'; DELETE FROM travelbuddy_backend.booking_orders WHERE traveler_id='11111111-1111-4111-8111-111111111111'; DELETE FROM travelbuddy_backend.packages WHERE id='refactor-test-pack'; DELETE FROM travelbuddy_backend.accounts WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');",
    );
    await documentDatabase().$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
