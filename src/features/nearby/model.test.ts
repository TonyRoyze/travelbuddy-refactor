import { describe, it, expect } from "vitest";
import {
  activeExperiences,
  groupPoints,
  meetingPointSchema,
  nearbySearchSchema,
} from "./model";
import type { LiveExperience } from "./types";
const item = {
  experience: { id: "walk" },
  provider: { id: "host" },
  location: {
    area: "Ella",
    label: "Station",
    latitude: 6.87,
    longitude: 81.05,
  },
  expiresAt: "2026-10-20T12:02:00Z",
} as LiveExperience;
describe("nearby discovery", () => {
  it("expires presence using server time even when the visitor's clock is wrong", () => {
    expect(
      activeExperiences([item], "2026-10-20T12:01:00Z", 1000, 1000),
    ).toEqual([item]);
    expect(
      activeExperiences([item], "2026-10-20T12:01:00Z", 1000, 61000),
    ).toEqual([]);
    expect(activeExperiences([item], "2026-10-20T12:01:00Z", 1000, 0)).toEqual([
      item,
    ]);
  });
  it("groups shared meeting points without dropping experiences", () => {
    const other = { ...item, experience: { ...item.experience, id: "food" } };
    const distant = { ...item, location: { ...item.location, longitude: 80 } };
    const groups = groupPoints([item, other, distant]);
    expect(groups.map((group) => group.length)).toEqual([2, 1]);
    expect(groups.flat()).toHaveLength(3);
  });
  it("validates URLs without choosing a location for the visitor", () => {
    expect(nearbySearchSchema.parse({})).toEqual({ area: "", view: "map" });
    expect(
      nearbySearchSchema.parse({ area: " Ella ", view: "unknown" }),
    ).toEqual({ area: "Ella", view: "map" });
  });
  it("rejects missing or invalid meeting coordinates rather than mapping to zero", () => {
    const point = { ...item.location, packageId: "walk" };
    expect(meetingPointSchema.safeParse(point).success).toBe(true);
    expect(
      meetingPointSchema.safeParse({ ...point, latitude: NaN }).success,
    ).toBe(false);
    expect(
      meetingPointSchema.safeParse({ ...point, longitude: 181 }).success,
    ).toBe(false);
    expect(meetingPointSchema.safeParse({ ...point, area: " " }).success).toBe(
      false,
    );
  });
});
