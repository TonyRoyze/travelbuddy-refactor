import { describe, expect, it } from "vitest";
import {
  daysUntilColomboDate,
  decodeNic,
  formatColomboDate,
  hmacCredential,
  isAtLeast18Colombo,
  normalizeNic,
} from "./nic";

describe("Sri Lankan NIC", () => {
  it("normalizes the legacy and canonical formats to the same number and hash", () => {
    expect(normalizeNic(" 90061-1234v ")).toBe("199006101234");
    expect(normalizeNic("1990 0610 1234")).toBe("199006101234");
    expect(normalizeNic("900611234Y")).toBeNull();
    const old = hmacCredential(normalizeNic("900611234x"), "pepper");
    expect(old).toHaveLength(64);
    expect(old).toBe(hmacCredential("199006101234", "pepper"));
    expect(old).not.toBe(hmacCredential("199006101234", "different"));
    expect(hmacCredential("199006101234", undefined)).toBeUndefined();
  });

  it.each([
    ["199006101234", "1990-03-01", "male"],
    ["199056101234", "1990-03-01", "female"],
    ["200006001234", "2000-02-29", "male"],
    ["199036601234", "1990-12-31", "male"],
    ["199086601234", "1990-12-31", "female"],
    ["199000101234", "1990-01-01", "male"],
  ])("decodes %s with a fixed 366-day calendar", (value, birthDate, gender) => {
    expect(decodeNic(value)).toEqual({ normalized: value, birthDate, gender });
  });

  it.each([
    "199006001234",
    "199000001234",
    "199036701234",
    "199050001234",
    "199086701234",
  ])("rejects invalid date code %s", (value) =>
    expect(decodeNic(value)).toBeNull(),
  );

  it("checks age and expiry at the Colombo calendar day boundary", () => {
    const before = new Date("2026-11-28T18:29:59Z");
    const after = new Date("2026-11-28T18:30:00Z");
    expect(formatColomboDate(after)).toBe("2026-11-29");
    expect(daysUntilColomboDate("2026-11-29", before)).toBe(1);
    expect(daysUntilColomboDate("2026-11-28", after)).toBe(-1);
    expect(daysUntilColomboDate("2026-02-30", after)).toBeNull();
    expect(isAtLeast18Colombo("2008-11-29", before)).toBe(false);
    expect(isAtLeast18Colombo("2008-11-29", after)).toBe(true);
  });
});
