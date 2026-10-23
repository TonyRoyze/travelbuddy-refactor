import { describe, it, expect } from "vitest";
import { validRates, convertedAmount, formatMoney } from "./model";
const now = new Date("2026-10-22T08:00:00Z");
const usd = { base: "LKR", quote: "USD", date: "2026-10-21", rate: 0.00302 };
describe("display currencies", () => {
  it("uses dated valid rates and rejects future, old, malformed or unsafe values", () => {
    expect(validRates([usd], now)).toEqual([usd]);
    for (const patch of [
      { rate: 0 },
      { rate: -1 },
      { rate: Infinity },
      { rate: "0.03" },
      { date: "2026-10-23" },
      { date: "2026-10-14" },
      { date: "bad" },
      { quote: "ZZZ" },
      { base: "USD" },
    ])
      expect(validRates([{ ...usd, ...patch }], now)).toEqual([]);
  });
  it("converts display amounts without modifying the LKR charge", () => {
    const rates = validRates(
      [usd, { base: "LKR", quote: "EUR", date: "2026-10-22", rate: 0.00269 }],
      now,
    );
    const total = 10000;
    expect(convertedAmount(total, "LKR", "USD", rates)).toBeCloseTo(30.2);
    expect(convertedAmount(30.2, "USD", "EUR", rates)).toBeCloseTo(26.9);
    expect(total).toBe(10000);
    expect(convertedAmount(total, "LKR", "GBP", rates)).toBeNull();
    expect(formatMoney(10000)).toContain("LKR");
  });
});
