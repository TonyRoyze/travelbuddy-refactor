import { describe, expect, it } from "vitest";
import { date, dlBack, dlFront, name, nic } from "../fixtures.test-support";
import {
  dlCoversVehicleClass,
  evaluateDrivingLicenceRules,
  normalizeVehicleCategory,
} from "./driving-licence";

const valid = {
  front: dlFront,
  back: dlBack,
  canonicalNic: nic,
  birthDate: "1990-03-01",
  legalName: name,
  nicName: name,
  vehicleClass: "B" as const,
  now: date,
};
const statuses = (value: Parameters<typeof evaluateDrivingLicenceRules>[0]) =>
  Object.fromEntries(
    evaluateDrivingLicenceRules(value).map(({ code, status }) => [
      code,
      status,
    ]),
  );

describe("driving licence rules", () => {
  it("maps common CR descriptions and handles valid licence class entitlements", () => {
    expect(normalizeVehicleCategory("Motor Car")).toBe("B");
    expect(normalizeVehicleCategory("Dual-Purpose Motor Vehicle")).toBeNull();
    expect(normalizeVehicleCategory("Dual-Purpose Motor Vehicle", 5, 2200)).toBe(
      "B",
    );
    expect(normalizeVehicleCategory("Dual-Purpose Motor Vehicle", 5, 4200)).toBeNull();
    expect(normalizeVehicleCategory("three-wheeler")).toBe("B1");
    expect(normalizeVehicleCategory("passenger van", 10)).toBe("D1");
    expect(normalizeVehicleCategory("passenger van", 35)).toBe("D");
    expect(dlCoversVehicleClass(["D"], "D1")).toBe(true);
    expect(dlCoversVehicleClass(["D"], "C")).toBe(true);
    expect(dlCoversVehicleClass(["D"], "J")).toBe(true);
    expect(dlCoversVehicleClass(["DE"], "CE")).toBe(true);
    expect(dlCoversVehicleClass(["J"], "G1")).toBe(true);
    expect(dlCoversVehicleClass(["A"], "A1")).toBe(true);
    expect(dlCoversVehicleClass(["C"], "C1")).toBe(true);
    expect(dlCoversVehicleClass(["B"], "B1")).toBe(false);
    expect(dlCoversVehicleClass(["A1"], "A")).toBe(false);
  });

  it("passes matching identity, dates, names, and class", () => {
    expect(statuses(valid)).toEqual({
      "DL-01": "pass",
      "DL-02": "pass",
      "DL-03": "pass",
      "DL-04": "pass",
    });
  });

  it("requests changes for mismatched licence numbers across front and back", () => {
    const back = {
      ...dlBack,
      fields: { ...dlBack.fields, licenceNumber: "OTHER-LICENCE-999" },
    };
    expect(statuses({ ...valid, back })).toMatchObject({
      "DL-03": "red",
    });
    const unlinkedBack = {
      ...dlBack,
      fields: { ...dlBack.fields, licenceNumber: null },
      fieldConfidences: { ...dlBack.fieldConfidences, licenceNumber: 0 },
    };
    expect(statuses({ ...valid, back: unlinkedBack })).toMatchObject({
      "DL-03": "amber",
    });
  });

  it("requests changes for reliable mismatches and expired licences or classes", () => {
    const front = {
      ...dlFront,
      fields: {
        ...dlFront.fields,
        nicNumber: "199006101235",
        expiresAt: "2026-11-27",
        fullName: "Other Person",
      },
    };
    const back = {
      ...dlBack,
      fields: {
        ...dlBack.fields,
        classes: [{ category: "B", expiresAt: "2026-11-27" }],
      },
    };
    expect(statuses({ ...valid, front, back })).toEqual({
      "DL-01": "red",
      "DL-02": "red",
      "DL-03": "red",
      "DL-04": "amber",
    });
  });

  it("routes low-confidence identity, unreadable classes and imminent expiry to review", () => {
    const front = {
      ...dlFront,
      fields: {
        ...dlFront.fields,
        nicNumber: "199006101235",
        expiresAt: "2026-12-28",
      },
      fieldConfidences: { ...dlFront.fieldConfidences, nicNumber: 0.7 },
    };
    expect(statuses({ ...valid, front, back: undefined })).toEqual({
      "DL-01": "amber",
      "DL-02": "amber",
      "DL-03": "amber",
      "DL-04": "pass",
    });
  });
});
