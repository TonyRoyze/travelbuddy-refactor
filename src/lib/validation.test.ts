import { describe, it, expect } from "vitest";
import { safeReturn, selectionSchema, searchSchema, today } from "./validation";
describe("navigation and booking inputs", () => {
  it("allows local booking context", () =>
    expect(safeReturn("/checkout?packageId=abc&travelers=2")).toBe(
      "/checkout?packageId=abc&travelers=2",
    ));
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/login?returnTo=/login",
    "/auth/callback",
    "/\nattack",
  ])("rejects unsafe or recursive return path %s", (value) =>
    expect(safeReturn(value)).toBe("/"),
  );
  it("defaults and bounds traveler selection", () => {
    expect(selectionSchema.parse({})).toEqual({ option: 0, travelers: 1 });
    expect(selectionSchema.parse({ travelers: 13, option: -1 })).toEqual({
      option: 0,
      travelers: 1,
    });
  });
  it("rejects invalid dates and times", () => {
    expect(selectionSchema.safeParse({ date: "2026-02-30" }).success).toBe(
      false,
    );
    expect(selectionSchema.safeParse({ time: "25:00" }).success).toBe(false);
  });
  it("uses Sri Lanka calendar date at a UTC date boundary", () =>
    expect(today(new Date("2026-10-15T20:00:00Z"))).toBe("2026-10-16"));
  it("restores legacy search URL filters and parses false booleans correctly", () => {
    expect(
      searchSchema.parse({ live: "false", freeCancellation: "false" }),
    ).toMatchObject({ live: false, freeCancellation: false });
    expect(
      searchSchema.parse({
        date: "2026-10-22",
        duration: "long",
        live: "1",
        freeCancellation: "true",
      }),
    ).toMatchObject({
      date: "2026-10-22",
      duration: "long",
      live: true,
      freeCancellation: true,
    });
    expect(
      searchSchema.parse({ date: "2026-02-30", duration: "injected" }),
    ).toMatchObject({ date: undefined, duration: undefined });
  });
  it("validates search defaults", () => {
    expect(searchSchema.parse({ page: -3, sort: "injected" })).toMatchObject({
      page: 1,
      sort: "recommended",
    });
  });
});
