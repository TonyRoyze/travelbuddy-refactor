import { describe, it, expect, vi, afterEach } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});
describe("daily exchange rate cache", () => {
  it("shares upstream fetches, retains dated rates on brief failures and rejects stale fallback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T08:00:00Z"));
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([
          { base: "LKR", quote: "USD", date: "2026-10-21", rate: 0.00302 },
        ]),
      )
      .mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", upstream);
    const { exchangeRates } = await import("./exchange-rates");
    const [a, b] = await Promise.all([exchangeRates(), exchangeRates()]);
    expect(a).toEqual(b);
    expect(upstream).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    expect((await exchangeRates())[0].date).toBe("2026-10-21");
    vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
    await expect(exchangeRates()).rejects.toThrow("temporarily unavailable");
  });
});
