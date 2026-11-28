import { describe, expect, it } from "vitest";
import {
  date,
  nic,
  policy,
  registration,
  revenue,
} from "../fixtures.test-support";
import {
  evaluateVehicleRules,
  isLeasedBankOwner,
  isLicensedSriLankanInsurer,
  normalizePlate,
} from "./vehicle";

const valid = {
  vehicle: registration,
  insurance: policy,
  revenue,
  canonicalNic: nic,
  now: date,
  duplicatePlate: false,
};
const statuses = (input: Parameters<typeof evaluateVehicleRules>[0]) =>
  Object.fromEntries(
    evaluateVehicleRules(input).map(({ code, status }) => [code, status]),
  );

describe("vehicle rules", () => {
  it("normalizes plate typography and validates the insurer roster", () => {
    expect(normalizePlate("WP CAB-1234")).toBe("CAB1234");
    expect(normalizePlate("cp cab — 1234")).toBe("CAB1234");
    expect(normalizePlate("CAB1234")).toBe("CAB1234");
    expect(normalizePlate("CAB12345")).toBeNull();
    for (const insurer of [
      "Sri Lanka Insurance",
      "Ceylinco General Insurance Ltd",
      "Fairfirst Insurance Limited",
      "Allianz Insurance Lanka",
      "Janashakthi General Insurance",
      "HNB General Insurance",
      "LOLC General Insurance PLC",
      "Softlogic General Insurance",
      "People’s Insurance PLC",
      "Co-operative Insurance",
      "Sanasa General Insurance",
      "Orient Insurance",
      "Continental Insurance",
      "Amana Takaful",
      "MBSL Insurance",
    ])
      expect(isLicensedSriLankanInsurer(insurer), insurer).toBe(true);
    expect(isLicensedSriLankanInsurer("Example Ceylinco Insurance Ltd")).toBe(
      false,
    );
    expect(isLeasedBankOwner("Example Bank PLC")).toBe(true);
    expect(isLeasedBankOwner("Example Person")).toBe(false);
  });

  it("passes a matching leased registration when the applicant is the registered owner", () => {
    expect(statuses(valid)).toEqual({
      "VEH-01": "pass",
      "VEH-02": "pass",
      "VEH-03": "pass",
      "VEH-04": "pass",
      "VEH-05": "pass",
      "VEH-06": "pass",
      "VEH-07": "pass",
    });
  });

  it("routes reliable conflicts to red and owner, usage and duplication concerns to amber", () => {
    const insurance = {
      ...policy,
      fields: {
        ...policy.fields,
        plate: "CP CAB-1234",
        chassisNumber: "OTHERCHASSIS",
        expiresAt: "2026-11-27",
        usage: "private" as const,
      },
    };
    const expired = {
      ...revenue,
      fields: { ...revenue.fields, expiresAt: "2026-11-27" },
    };
    expect(
      statuses({
        ...valid,
        insurance,
        revenue: expired,
        thirdPartyVehicle: true,
        duplicatePlate: true,
      }),
    ).toEqual({
      "VEH-01": "red",
      "VEH-02": "red",
      "VEH-03": "red",
      "VEH-04": "amber",
      "VEH-05": "red",
      "VEH-06": "amber",
      "VEH-07": "amber",
    });
  });

  it("rejects mismatched engine serials even when chassis matches", () => {
    const insurance = {
      ...policy,
      fields: { ...policy.fields, engineNumber: "OTHERENGINE" },
      fieldConfidences: { ...policy.fieldConfidences, engineNumber: 0.95 },
    };
    expect(statuses({ ...valid, insurance })).toMatchObject({
      "VEH-02": "red",
    });
  });

  it("holds a cover note that expires in under 14 days and unmatched ownership with a finance company", () => {
    const insurance = {
      ...policy,
      fields: {
        ...policy.fields,
        expiresAt: "2026-12-11",
        temporaryCoverNote: true,
      },
    };
    expect(
      statuses({ ...valid, insurance, canonicalNic: "199006101235" }),
    ).toMatchObject({
      "VEH-03": "amber",
      "VEH-06": "amber",
    });
  });
});
