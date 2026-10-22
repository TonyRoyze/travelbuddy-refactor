import { createServer } from "node:http";
import { exchangeRates } from "./exchange-rates";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { checkoutHash, verifyNotification } from "./payhere";
import { refundPayment } from "./refund";
import type { Database } from "../../src/types/database";
if (existsSync(".env.media.local")) loadEnvFile(".env.media.local");
if (existsSync(".env.payments.local")) loadEnvFile(".env.payments.local");
const url = process.env.SUPABASE_URL,
  publicKey = process.env.SUPABASE_PUBLISHABLE_KEY,
  serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publicKey || !serviceKey)
  throw new Error(
    "Configure private Supabase settings for the payment service; see .env.payments.example.",
  );
const mode = process.env.PAYHERE_MODE ?? "sandbox";
if (!["sandbox", "live"].includes(mode))
  throw new Error("PAYHERE_MODE must be sandbox or live.");
const site = process.env.PAYMENTS_SITE_URL ?? "http://localhost:5173";
const notifyBase = process.env.PAYMENTS_CALLBACK_URL || site;
for (const value of [site, notifyBase]) {
  const parsed = new URL(value);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  )
    throw new Error(
      "Payment site and callback settings must be HTTP(S) origins without paths or credentials.",
    );
}
const merchant = process.env.PAYHERE_MERCHANT_ID ?? "",
  secret = process.env.PAYHERE_MERCHANT_SECRET ?? "";
if (
  mode === "live" &&
  (!site.startsWith("https://") || !notifyBase.startsWith("https://"))
)
  throw new Error("Live payments require public HTTPS origins.");
const callback = new URL(notifyBase);
const configured =
  !!merchant &&
  !!secret &&
  callback.protocol === "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname);
const base =
  mode === "live" ? "https://www.payhere.lk" : "https://sandbox.payhere.lk";
const service = createClient<Database, "travelbuddy_api">(url, serviceKey, {
  db: { schema: "travelbuddy_api" },
  auth: { persistSession: false, autoRefreshToken: false },
});
class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
let refundBusy = false;
async function refunds() {
  if (refundBusy) return;
  refundBusy = true;
  try {
    // Expiry also runs inside inventory RPCs, so checkout never relies on this timer.
    const expired = await service.rpc("expire_payment_holds");
    if (expired.error) throw new Error("Payment expiry failed");
    if (!process.env.PAYHERE_APP_ID || !process.env.PAYHERE_APP_SECRET) return;
    const claimed = await service.rpc("claim_payment_refund");
    if (claimed.error || !claimed.data) return;
    const refund = claimed.data as {
      id: string;
      paymentId: string;
      amount: number;
      reason: string;
    };
    let reference: string | undefined;
    try {
      reference = await refundPayment(
        base,
        process.env.PAYHERE_APP_ID,
        process.env.PAYHERE_APP_SECRET,
        refund,
      );
    } catch {
      console.error(
        `Refund ${refund.id} requires merchant reconciliation; automatic retries are disabled.`,
      );
    }
    const saved = await service.rpc("finish_payment_refund", {
      refund_id: refund.id,
      ...(reference ? { reference } : {}),
    });
    if (saved.error)
      console.error(
        `Refund ${refund.id} result could not be recorded; merchant reconciliation is required.`,
      );
  } catch {
    console.error(
      "Payment maintenance failed; check database/service configuration.",
    );
  } finally {
    refundBusy = false;
  }
}
const server = createServer(
  { requestTimeout: 30000, headersTimeout: 10000 },
  async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, data: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "GET" && req.url === "/payments-api/exchange-rates") {
        try {
          send(200, await exchangeRates());
        } catch {
          send(503, { error: "Exchange rates unavailable" });
        }
        return;
      }
      if (req.method === "GET" && req.url === "/payments-api/config") {
        send(200, {
          configured,
          mode,
          refundsConfigured:
            !!process.env.PAYHERE_APP_ID && !!process.env.PAYHERE_APP_SECRET,
        });
        return;
      }
      if (
        req.method !== "POST" ||
        !["/payments-api/start", "/payments-api/notify"].includes(req.url ?? "")
      )
        throw new RequestError("Payment endpoint not found.", 404);
      if (!configured)
        throw new RequestError(
          "Online payment is not configured yet. Please contact your Buddy or choose an eligible pay-on-arrival package.",
          503,
        );
      const notify = req.url === "/payments-api/notify";
      if (!notify && req.headers.origin !== new URL(site).origin)
        throw new RequestError("Open checkout in TravelBuddy first.", 403);
      if (
        !(req.headers["content-type"] ?? "").startsWith(
          notify ? "application/x-www-form-urlencoded" : "application/json",
        )
      )
        throw new RequestError("Invalid content type.", 415);
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 16384)
          throw new RequestError("Payment request is too large.", 413);
      }
      if (notify) {
        const params = new URLSearchParams(raw);
        const fields = Object.fromEntries(params);
        if (
          [...params.keys()].some((key) => params.getAll(key).length !== 1) ||
          !verifyNotification(fields, merchant, secret)
        )
          throw new RequestError("Invalid payment signature.", 403);
        const result = await service.rpc("apply_payment_notification", {
          attempt_id: fields.order_id,
          payment_id: fields.payment_id,
          amount: Number(fields.payhere_amount),
          currency: fields.payhere_currency,
          status_code: fields.status_code,
        });
        if (result.error)
          throw new RequestError(
            "Payment notification does not match an order.",
            409,
          );
        send(200, { received: true });
        return;
      }
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer "))
        throw new RequestError("Sign in before paying.", 401);
      const client = createClient<Database, "travelbuddy_api">(url, publicKey, {
        db: { schema: "travelbuddy_api" },
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const user = await client.auth.getUser(auth.slice(7));
      if (user.error || !user.data.user)
        throw new RequestError("Sign in before paying.", 401);
      const input = JSON.parse(raw) as {
        orderId?: string;
        billing?: Record<string, string>;
      };
      if (!input.orderId || !input.billing)
        throw new RequestError("Complete your billing details.");
      const billing: Record<string, string> = {};
      for (const key of [
        "first_name",
        "last_name",
        "phone",
        "address",
        "city",
        "country",
      ]) {
        const value = input.billing[key];
        if (typeof value !== "string" || !value.trim() || value.length > 200)
          throw new RequestError("Complete your billing details.");
        billing[key] = value.trim();
      }
      if (!/^[+()\d .-]{7,30}$/.test(billing.phone))
        throw new RequestError("Enter a valid phone number.");
      const order = await client.rpc("payment_order", {
        order_id: input.orderId,
      });
      if (order.error) throw new RequestError("Payment order not found.", 403);
      const begun = await service.rpc("begin_payment", {
        actor_id: user.data.user.id,
        order_id: input.orderId,
      });
      if (begun.error)
        throw new RequestError(
          "This order is no longer awaiting payment. Refresh its status.",
          409,
        );
      const pay = begun.data as {
        attemptId: string;
        amount: number;
        currency: string;
      };
      const details = order.data as { bookings: { travelerEmail: string }[] };
      if (pay.currency !== "LKR")
        throw new RequestError(
          "Only LKR payments are supported for new transactions.",
          409,
        );
      const amount = Number(pay.amount).toFixed(2);
      send(200, {
        action: `${base}/pay/checkout`,
        fields: {
          ...billing,
          merchant_id: merchant,
          order_id: pay.attemptId,
          amount,
          currency: pay.currency,
          hash: checkoutHash(
            merchant,
            pay.attemptId,
            amount,
            pay.currency,
            secret,
          ),
          email: details.bookings[0].travelerEmail,
          items: "TravelBuddy experience booking",
          return_url: `${site}/payments/${input.orderId}?returned=1`,
          cancel_url: `${site}/payments/${input.orderId}?cancelled=1`,
          notify_url: `${notifyBase}/payments-api/notify`,
        },
      });
    } catch (error) {
      send(error instanceof RequestError ? error.status : 400, {
        error:
          error instanceof RequestError
            ? error.message
            : "Unable to process payment request.",
      });
    }
  },
);
server.listen(
  Number(process.env.PAYMENTS_PORT ?? 5175),
  process.env.PAYMENTS_HOST ?? "127.0.0.1",
  () =>
    console.log(
      `Payment service ready (${mode}; checkout ${configured ? "configured" : "not configured"})`,
    ),
);
const timer = setInterval(() => void refunds(), 15000);
timer.unref();
function stop() {
  clearInterval(timer);
  server.close();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
