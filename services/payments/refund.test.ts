import { describe, it, expect, vi } from "vitest";
import { refundPayment } from "./refund";
describe("PayHere refund processing", () => {
  const base = "https://sandbox.payhere.lk",
    refund = {
      paymentId: "payment-1",
      amount: 42,
      reason: "Free cancellation",
    };
  it("uses merchant authorization and an exact partial amount before confirming a refund", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockResolvedValueOnce(Response.json({ status: 1, data: 12345 }));
    expect(await refundPayment(base, "app", "secret", refund, request)).toBe(
      "12345",
    );
    expect(request.mock.calls[0][0]).toBe(base + "/merchant/v1/oauth/token");
    expect(request.mock.calls[1][0]).toBe(base + "/merchant/v1/payment/refund");
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      payment_id: "payment-1",
      amount: "42.00",
      description: "Free cancellation",
    });
  });
  it("does not report an unknown refund outcome as refunded or retry the charge", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockRejectedValueOnce(new Error("Network timeout"));
    await expect(
      refundPayment(base, "app", "secret", refund, request),
    ).rejects.toThrow("Network timeout");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not attempt refunds after failed authorization", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "invalid_client" }, { status: 401 }),
      );
    await expect(
      refundPayment(base, "app", "secret", refund, request),
    ).rejects.toThrow("Refund authorization failed");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
