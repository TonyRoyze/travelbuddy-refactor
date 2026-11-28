import { describe, expect, it } from "vitest";
import {
  date,
  dlBack,
  dlFront,
  idBack,
  idFront,
  inspected,
  job,
  name,
  nic,
  policy,
  registration,
  revenue,
} from "../fixtures.test-support";
import { evaluateVerificationRules, type RuleEngineInput } from "./engine";

const green: RuleEngineInput = {
  job,
  config: {
    mode: "auto",
    providerMode: "option_a_inhouse",
    hmacPepper: "secret",
  },
  images: { "id-front": inspected, "id-back": inspected, selfie: inspected },
  extractions: { "id-front": idFront, "id-back": idBack },
  barcode: { nicNumber: nic, birthDate: "1990-03-01" },
  livenessStatus: "passed",
  nicFaceScore: 0.75,
  dlFaceScore: null,
  duplicates: { duplicateNic: false, duplicatePlate: false },
  providerFailure: false,
  now: date,
};
const getRule = (input: RuleEngineInput, code: string, field?: string) =>
  evaluateVerificationRules(input).ruleOutcomes.find(
    (rule) => rule.code === code && (!field || rule.field === field),
  );

describe("verification decision engine", () => {
  it.each([
    ["auto", "approved"],
    ["assisted", "manual_review"],
    ["shadow", "manual_review"],
  ] as const)("routes green evidence in %s mode", (mode, effectiveStatus) => {
    expect(
      evaluateVerificationRules({
        ...green,
        config: { ...green.config, mode },
      }),
    ).toMatchObject({
      decisionBucket: "green",
      effectiveStatus,
      shadowMode: mode === "shadow",
      pdf417Passed: true,
      applicantFeedback: null,
      credentials: {
        service: "local",
        nicHmac: expect.stringMatching(/^[\da-f]{64}$/),
      },
    });
  });

  it("covers every applicable transport rule and redacts extracted identifiers", () => {
    const transport: RuleEngineInput = {
      ...green,
      job: { ...job, details: { ...job.details, service: "transport" } },
      images: {
        ...green.images,
        "driving-licence-front": inspected,
        "driving-licence-back": inspected,
        vehicle: inspected,
        insurance: inspected,
        "revenue-licence": inspected,
      },
      extractions: {
        ...green.extractions,
        "driving-licence-front": dlFront,
        "driving-licence-back": dlBack,
        vehicle: registration,
        insurance: policy,
        "revenue-licence": revenue,
      },
      nicFaceScore: 0.51,
      dlFaceScore: 0.8,
    };
    const output = evaluateVerificationRules(transport);
    expect(output).toMatchObject({
      decisionBucket: "green",
      credentials: {
        service: "transport",
        vehiclePlateNormalized: "CAB1234",
        vehicleClass: "B",
        dlExpiresAt: "2028-01-02",
        erlExpiresAt: "2027-10-28",
        insuranceExpiresAt: "2027-10-28",
      },
    });
    expect(output.ruleOutcomes.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "DL-01",
        "DL-02",
        "DL-03",
        "DL-04",
        "VEH-01",
        "VEH-02",
        "VEH-03",
        "VEH-04",
        "VEH-05",
        "VEH-06",
        "VEH-07",
      ]),
    );
    const redacted = JSON.stringify([
      output.extractedSummary,
      output.ruleOutcomes,
    ]);
    for (const privateValue of [
      nic,
      name,
      "1990-03-01",
      "CAB1234",
      "TESTLICENCE123",
      "TESTCHASSIS",
    ])
      expect(redacted).not.toContain(privateValue);
  });

  it("returns actionable feedback for a confident barcode mismatch without disclosing internal flags", () => {
    const input = {
      ...green,
      barcode: { nicNumber: "199006101235", birthDate: "1990-03-01" },
      duplicates: { duplicateNic: true, duplicatePlate: false },
    };
    const output = evaluateVerificationRules(input);
    expect(output).toMatchObject({
      decisionBucket: "red",
      effectiveStatus: "changes_requested",
      pdf417Passed: false,
    });
    expect(output.applicantFeedback).toMatch(
      /both sides of the same identity card/i,
    );
    expect(output.applicantFeedback).not.toMatch(/duplicate|fraud|tamper|1990/);
    expect(
      evaluateVerificationRules({
        ...input,
        config: { ...green.config, mode: "shadow" },
      }),
    ).toMatchObject({
      applicantFeedback: null,
      effectiveStatus: "manual_review",
    });
    expect(
      evaluateVerificationRules({
        ...input,
        config: { ...green.config, mode: "assisted" },
      }).effectiveStatus,
    ).toBe("changes_requested");
  });

  it("distinguishes unreadable images, wrong-slot images and suspected edits", () => {
    expect(
      getRule(
        {
          ...green,
          images: { ...green.images, selfie: { ...inspected, isBlurry: true } },
        },
        "QA-01",
        "selfie",
      )?.status,
    ).toBe("red");
    expect(
      getRule(
        {
          ...green,
          extractions: {
            ...green.extractions,
            "id-front": { ...idFront, detectedDocumentType: "selfie" },
          },
        },
        "QA-02",
        "id-front",
      )?.status,
    ).toBe("red");
    expect(
      getRule(
        {
          ...green,
          extractions: {
            ...green.extractions,
            "id-front": { ...idFront, qualityFlags: ["screen_photo"] },
          },
        },
        "QA-03",
        "id-front",
      )?.status,
    ).toBe("amber");
  });

  it("holds unreadable Smart NIC barcodes and low-confidence legacy data", () => {
    expect(getRule({ ...green, barcode: null }, "NIC-03")?.status).toBe(
      "amber",
    );
    const old = {
      ...idFront,
      fields: {
        ...idFront.fields,
        nicFormat: "old" as const,
        nicNumber: "900611234V",
      },
      fieldConfidences: { ...idFront.fieldConfidences, birthDate: 0.5 },
    };
    const input = {
      ...green,
      extractions: { ...green.extractions, "id-front": old },
      nicFaceScore: 0.49,
    };
    expect(getRule(input, "NIC-04")?.status).toBe("amber");
    expect(getRule(input, "BIO-03")?.status).toBe("amber");
    expect(
      getRule(
        {
          ...green,
          extractions: { ...green.extractions, "id-front": old },
          nicFaceScore: 0.25,
          dlFaceScore: 0.9,
        },
        "BIO-03",
      )?.status,
    ).toBe("pass");
    expect(
      getRule(
        {
          ...green,
          nicFaceScore: 0.25,
          dlFaceScore: 0.9,
        },
        "BIO-03",
      )?.status,
    ).toBe("amber");
    expect(
      getRule(
        {
          ...green,
          extractions: { ...green.extractions, "id-front": old },
          nicFaceScore: 0.9,
          dlFaceScore: 0.25,
        },
        "BIO-03",
      )?.status,
    ).toBe("amber");
    expect(getRule({ ...green, nicFaceScore: 0.49 }, "BIO-03")?.status).toBe(
      "red",
    );
    expect(getRule({ ...green, nicFaceScore: 0.5 }, "BIO-03")?.status).toBe(
      "amber",
    );
  });

  it("handles opt-out, outage, missing HMAC key and an unimplemented hybrid provider", () => {
    const optedOut = {
      ...green,
      job: {
        ...job,
        details: { ...job.details, faceComparisonConsent: false },
      },
    };
    expect(getRule(optedOut, "BIO-01")?.status).toBe("amber");
    expect(getRule({ ...green, providerFailure: true }, "SYS-01")?.status).toBe(
      "amber",
    );
    expect(
      evaluateVerificationRules({
        ...green,
        config: { ...green.config, hmacPepper: undefined },
      }),
    ).toMatchObject({ decisionBucket: "amber" });
    expect(
      evaluateVerificationRules({
        ...green,
        config: { ...green.config, providerMode: "option_b_hybrid" },
      }),
    ).toMatchObject({ decisionBucket: "amber" });
  });

  it("escalates the third liveness failure and caps automated submissions at five", () => {
    const spoof = {
      ...green,
      livenessStatus: "spoof" as const,
      nicFaceScore: null,
    };
    expect(evaluateVerificationRules(spoof).decisionBucket).toBe("red");
    expect(
      evaluateVerificationRules({
        ...spoof,
        job: { ...job, consecutiveSpoofFailures: 2 },
      }).decisionBucket,
    ).toBe("amber");
    expect(
      evaluateVerificationRules({
        ...green,
        job: { ...job, recentSubmissions24h: 5 },
      }).decisionBucket,
    ).toBe("green");
    expect(
      evaluateVerificationRules({
        ...spoof,
        job: { ...job, recentSubmissions24h: 6 },
      }),
    ).toMatchObject({
      decisionBucket: "amber",
      ruleOutcomes: [{ code: "SYS-01", status: "amber" }],
    });
  });
});
