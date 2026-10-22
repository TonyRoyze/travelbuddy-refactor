import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { checkoutHash, verifyNotification } from "./payhere";
describe("PayHere signatures", () => {
  const secret = "test-merchant-secret";
  const hash = (text: string) =>
    createHash("md5").update(text).digest("hex").toUpperCase();
  const fields = {
    merchant_id: "12345",
    order_id: "test-order",
    payhere_amount: "42.00",
    payhere_currency: "USD",
    status_code: "2",
    payment_id: "payment-1",
    md5sig: hash("12345test-order42.00USD2" + hash(secret)),
  };
  it("signs exact server amount and currency", () =>
    expect(checkoutHash("12345", "test-order", "42.00", "USD", secret)).toBe(
      hash("12345test-order42.00USD" + hash(secret)),
    ));
  it("accepts only matching notification checksums", () => {
    expect(verifyNotification(fields, "12345", secret)).toBe(true);
    for (const changed of [
      { payhere_amount: "43.00" },
      { payhere_currency: "LKR" },
      { status_code: "-1" },
      { merchant_id: "other" },
      { order_id: "other" },
      { md5sig: "0".repeat(32) },
      { md5sig: "bad" },
      { payhere_amount: "42" },
    ])
      expect(
        verifyNotification({ ...fields, ...changed }, "12345", secret),
      ).toBe(false);
  });
});
