// Contract test against real local Supabase. Gateway callbacks are signed test fixtures, not real card transactions.
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import type { Booking } from "../src/features/bookings/types";
import type { EditorPackage } from "../src/features/packages/model";
loadEnvFile(".env.media.local");
assert.ok(
  ["localhost", "127.0.0.1"].includes(
    new URL(process.env.SUPABASE_URL!).hostname,
  ),
  "Local Supabase only",
);
const path = process.argv[2];
const fixture = JSON.parse(await readFile(path, "utf8")) as {
  tag: string;
  packages: string[];
  users: { id: string; accountId: string; email: string; password: string }[];
  paymentQA?: Record<string, string>;
};
assert.ok(
  fixture.packages.every((id) => id.startsWith(`nearby-qa-${fixture.tag}-`)),
  "Use generated local fixtures",
);
const make = () =>
  createClient<Database, "travelbuddy_api">(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "travelbuddy_api" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
const host = make(),
  traveler = make();
for (const [i, c] of [host, traveler].entries())
  assert.ifError((await c.auth.signInWithPassword(fixture.users[i])).error);
const rpc = async (
  c: ReturnType<typeof make>,
  name: keyof Database["travelbuddy_api"]["Functions"],
  args: Record<string, unknown> = {},
) => {
  const r = await c.rpc(name, args as never);
  assert.ifError(r.error);
  return r.data;
};
const runTag = fixture.tag + "-" + randomUUID().slice(0, 8);
const secret = "local-contract-test-secret",
  merchant = "local-test-merchant";
const child = spawn(
  process.execPath,
  ["--import", "tsx", "services/payments/server.ts"],
  {
    env: {
      ...process.env,
      PAYMENTS_PORT: "5176",
      PAYHERE_MODE: "sandbox",
      PAYHERE_MERCHANT_ID: merchant,
      PAYHERE_MERCHANT_SECRET: secret,
      PAYMENTS_SITE_URL: "http://localhost:5173",
      PAYMENTS_CALLBACK_URL: "https://callback.example.test",
      PAYHERE_APP_ID: "",
      PAYHERE_APP_SECRET: "",
    },
    stdio: "ignore",
  },
);
const endpoint = "http://127.0.0.1:5176/payments-api";
const md5 = (v: string) =>
  createHash("md5").update(v).digest("hex").toUpperCase();
try {
  for (let n = 0; n < 50; n++) {
    try {
      if ((await fetch(endpoint + "/config")).ok) break;
    } catch {
      /* Wait for child startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    (await (await fetch(endpoint + "/config")).json()).configured,
    true,
  );
  const editor = (await rpc(host, "buddy_package", {
    package_id: fixture.packages[0],
  })) as unknown as EditorPackage;
  await rpc(host, "save_buddy_package", {
    package_id: editor.id,
    input: { ...editor.input, payLater: true },
  });
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const reserve = async (method = "online", index = 0) =>
    (await rpc(traveler, "checkout", {
      input: {
        idempotencyKey: randomUUID(),
        travelerName: "Payment QA Traveler",
        travelerEmail: fixture.users[1].email,
        paymentMethod: method,
        items: [
          {
            id: randomUUID(),
            experienceId: fixture.packages[index],
            option: 0,
            date: day,
            time: "09:00",
            travelers: 1,
          },
        ],
      },
    })) as unknown as Booking[];
  const session = (await traveler.auth.getSession()).data.session!;
  const billing = {
    first_name: "QA",
    last_name: "Traveler",
    phone: "+94770000000",
    address: "Test address",
    city: "Colombo",
    country: "Sri Lanka",
  };
  const start = async (orderId: string, token = session.access_token) =>
    fetch(endpoint + "/start", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId, billing }),
    });
  const notification = (
    attempt: string,
    payment: string,
    amount = "25.55",
  ) => ({
    merchant_id: merchant,
    order_id: attempt,
    payment_id: payment,
    payhere_amount: amount,
    payhere_currency: "LKR",
    status_code: "2",
    md5sig: md5(merchant + attempt + amount + "LKR2" + md5(secret)),
  });
  const post = (fields: Record<string, string>) =>
    fetch(endpoint + "/notify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
  const online = (await reserve())[0];
  assert.equal(online.paymentStatus, "pending");
  assert.equal((await start(online.orderId, "invalid-token")).status, 401);
  const prepared = await start(online.orderId);
  assert.equal(prepared.status, 200);
  const form = (await prepared.json()) as {
    action: string;
    fields: Record<string, string>;
  };
  assert.equal(form.action, "https://sandbox.payhere.lk/pay/checkout");
  assert.equal(form.fields.amount, "25.55");
  assert.equal(form.fields.currency, "LKR");
  assert.ok(
    form.fields.notify_url.startsWith("https://callback.example.test/"),
  );
  assert.equal(
    (
      await post({
        ...notification(form.fields.order_id, `qa-${runTag}-paid`),
        md5sig: "0".repeat(32),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        notification(form.fields.order_id, `qa-${runTag}-wrong`, "1.00"),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      (await rpc(traveler, "payment_order", { order_id: online.orderId })) as {
        status: string;
      }
    ).status,
    "pending",
  );
  assert.equal(
    (await post(notification(form.fields.order_id, `qa-${runTag}-paid`)))
      .status,
    200,
  );
  assert.equal(
    (await post(notification(form.fields.order_id, `qa-${runTag}-paid`)))
      .status,
    200,
  );
  assert.equal(
    (
      (await rpc(traveler, "payment_order", { order_id: online.orderId })) as {
        status: string;
      }
    ).status,
    "paid",
  );
  assert.equal(
    (await start(online.orderId)).status,
    409,
    "Paid orders cannot start again",
  );
  const cancelled = (await rpc(traveler, "cancel_booking", {
    booking_id: online.id,
  })) as unknown as Booking;
  assert.equal(cancelled.refundStatus, "pending");
  const arrival = (await reserve("pay_later"))[0];
  assert.equal(arrival.paymentStatus, "due");
  assert.equal(
    (await start(arrival.orderId)).status,
    409,
    "Arrival reservations cannot be charged online",
  );
  const unpaid = (await reserve("online", 1))[0];
  const held = (await (await start(unpaid.orderId)).json()).fields as Record<
    string,
    string
  >;
  const q = spawnSync(
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
    {
      input: `UPDATE travelbuddy_private.order_payments SET expires_at=now()-interval '1 minute' WHERE order_id='${unpaid.orderId}'::uuid;`,
      encoding: "utf8",
    },
  );
  assert.equal(q.status, 0, q.stderr);
  const expired = (await rpc(traveler, "payment_order", {
    order_id: unpaid.orderId,
  })) as { status: string; bookings: Booking[] };
  assert.equal(expired.status, "expired");
  assert.equal(expired.bookings[0].status, "Cancelled");
  assert.equal(
    (await post(notification(held.order_id, `qa-${runTag}-late`))).status,
    200,
  );
  const late = (await rpc(traveler, "payment_order", {
    order_id: unpaid.orderId,
  })) as { status: string; bookings: Booking[] };
  assert.equal(late.status, "expired");
  assert.equal(late.bookings[0].refundStatus, "pending");
  // Keep one pending order for UI status and billing tests; it has its own inventory slot.
  const pending = (await reserve("online", 2))[0];
  fixture.paymentQA = {
    paidOrder: online.orderId,
    arrivalBooking: arrival.id,
    pendingOrder: pending.orderId,
    day,
  };
  await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
  const dashboard = (await rpc(host, "provider_dashboard", {})) as {
    total: number;
  };
  assert.ok(dashboard.total >= 4);
  const chat = await rpc(host, "booking_chat", { booking_id: arrival.id });
  await rpc(host, "send_message", {
    conversation_id: chat,
    body: "Your arrival booking is ready. Meet us at the station.",
  });
  if (process.argv.includes("--browser")) {
    const browser = spawnSync(
      process.env.PLAYWRIGHT_PYTHON ?? "python3",
      ["scripts/test-vidura-browser.py", path],
      {
        env: { ...process.env, PAYMENT_TEST_ENDPOINT: endpoint },
        stdio: "inherit",
      },
    );
    assert.equal(browser.status, 0, "Browser workflow failed");
  }
  console.log(
    "Payment HTTP contract checks passed: real Auth, signed callbacks, tampering, exact totals, repeat submissions, arrival terms, expiry, late-payment refunds and provider inbox. No real card transaction was performed.",
  );
} finally {
  child.kill("SIGTERM");
}
