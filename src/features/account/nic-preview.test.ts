import { describe, expect, it } from "vitest";
import { normalizeNicNumber, previewNic } from "./nic-preview";

describe("Sri Lankan NIC preview", () => {
  it("normalizes spaces, hyphens, and lowercase suffixes", () => {
    expect(normalizeNicNumber(" 90 061-1234v ")).toBe("900611234V");
    expect(previewNic(" 90 061-1234x ")).toEqual({
      birthDate: "1990-03-01",
      gender: "male",
    });
  });

  it.each([
    ["200000100001", "2000-01-01", "male"],
    ["199006100001", "1990-03-01", "male"],
    ["199036600001", "1990-12-31", "male"],
    ["199050100001", "1990-01-01", "female"],
    ["199056100001", "1990-03-01", "female"],
    ["199086600001", "1990-12-31", "female"],
    ["200006000001", "2000-02-29", "male"],
    ["005611234V", "1900-03-01", "female"],
  ] as const)("decodes %s", (number, birthDate, gender) => {
    expect(previewNic(number)).toEqual({ birthDate, gender });
  });

  it.each([
    "",
    "900611234A",
    "199000000001",
    "199036700001",
    "199050000001",
    "199086700001",
    "199006000001",
    "005601234V",
    "19900610000A",
  ])("rejects invalid NIC %s", (number) =>
    expect(previewNic(number)).toBeNull(),
  );
});
