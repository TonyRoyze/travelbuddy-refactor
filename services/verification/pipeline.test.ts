import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseSriLankanNicPdf417,
  decodeSmartNicPdf417,
} from "./barcode/pdf417";
import {
  date,
  idBack,
  idFront,
  job,
  nic,
  patternedImage,
} from "./fixtures.test-support";
import { runVerificationPipeline, type PipelineDependencies } from "./pipeline";
import type { IdentityVerificationProvider } from "./providers/interface";
import { hmacCredential } from "./rules/nic";

vi.mock("./barcode/pdf417", async (original) => ({
  ...(await original<typeof import("./barcode/pdf417")>()),
  decodeSmartNicPdf417: vi.fn(),
}));

function dependencies() {
  const provider = {
    mode: "option_a_inhouse",
    livenessConfigured: true,
    visionConfigured: true,
    createLivenessSession:
      vi.fn<IdentityVerificationProvider["createLivenessSession"]>(),
    getLivenessResult: vi
      .fn<IdentityVerificationProvider["getLivenessResult"]>()
      .mockResolvedValue({ status: "passed", sessionImageId: "frame-id" }),
    getLivenessImage: vi
      .fn<IdentityVerificationProvider["getLivenessImage"]>()
      .mockResolvedValue(Buffer.from([1])),
    verifyFace: vi
      .fn<IdentityVerificationProvider["verifyFace"]>()
      .mockResolvedValue(0.91),
    extractDocument: vi
      .fn<IdentityVerificationProvider["extractDocument"]>()
      .mockImplementation(async (kind) =>
        kind === "id-front" ? idFront : idBack,
      ),
    deleteLivenessSession:
      vi.fn<IdentityVerificationProvider["deleteLivenessSession"]>(),
  } as const;
  const checkDuplicates = vi
    .fn<PipelineDependencies["checkDuplicates"]>()
    .mockResolvedValue({ duplicateNic: false, duplicatePlate: false });
  return {
    provider,
    checkDuplicates,
    config: {
      mode: "auto",
      providerMode: provider.mode,
      hmacPepper: "fixture",
    },
    now: () => date,
  } as const;
}

async function submission() {
  const content = {
    base64: (await patternedImage()).toString("base64"),
    mimeType: "image/png",
  };
  return {
    ...job,
    images: { "id-front": content, "id-back": content, selfie: content },
  };
}

describe("verification pipeline", () => {
  beforeEach(() => {
    vi.mocked(decodeSmartNicPdf417)
      .mockReset()
      .mockResolvedValue(`NIC=${nic}; DOB=1990-03-01`);
  });

  it("inspects images, decodes the barcode locally, binds liveness and checks credential hashes", async () => {
    const deps = dependencies();
    const output = await runVerificationPipeline(await submission(), deps);
    expect(deps.provider.getLivenessResult).toHaveBeenCalledWith(
      job.livenessSessionId,
      job.accountId,
      job.submittedAt,
      expect.any(AbortSignal),
    );
    expect(deps.provider.getLivenessImage).toHaveBeenCalledWith(
      "frame-id",
      expect.any(AbortSignal),
    );
    expect(deps.provider.verifyFace).toHaveBeenCalledTimes(2);
    expect(
      deps.provider.extractDocument.mock.calls.map(([slot]) => slot).sort(),
    ).toEqual(["id-back", "id-front"]);
    expect(decodeSmartNicPdf417).toHaveBeenCalledTimes(1);
    expect(parseSriLankanNicPdf417(nic)?.nicNumber).toBe(nic);
    expect(deps.checkDuplicates).toHaveBeenCalledWith(
      job.accountId,
      hmacCredential(nic, "fixture"),
      null,
    );
    expect(output).toMatchObject({
      decisionBucket: "green",
      effectiveStatus: "approved",
      latencyMs: expect.any(Number),
    });
  });

  it("routes a provider outage to review and skips every biometric call on opt-out", async () => {
    const deps = dependencies();
    deps.provider.extractDocument.mockRejectedValue(
      new Error("private provider response"),
    );
    const application = await submission();
    application.details = {
      ...application.details,
      faceComparisonConsent: false,
    };
    const output = await runVerificationPipeline(application, deps);
    expect(output.decisionBucket).toBe("amber");
    expect(output.livenessStatus).toBeNull();
    expect(JSON.stringify(output)).not.toContain("private provider response");
    expect(deps.provider.getLivenessResult).not.toHaveBeenCalled();
    expect(deps.provider.getLivenessImage).not.toHaveBeenCalled();
    expect(deps.provider.verifyFace).not.toHaveBeenCalled();
  });

  it("holds an unbound liveness verdict, still compares faces when liveness is unavailable, and requests changes for a clear mismatch", async () => {
    const deps = dependencies();
    const application = await submission();
    deps.provider.getLivenessResult.mockResolvedValueOnce({ status: "passed" });
    await expect(
      runVerificationPipeline(application, deps),
    ).resolves.toMatchObject({
      decisionBucket: "amber",
      livenessStatus: "unavailable",
      nicFaceScore: 0.91,
    });
    const withoutSession = await submission();
    withoutSession.livenessSessionId = null;
    await expect(
      runVerificationPipeline(withoutSession, deps),
    ).resolves.toMatchObject({
      decisionBucket: "amber",
      livenessStatus: "unavailable",
      nicFaceScore: 0.91,
    });
    deps.provider.verifyFace.mockResolvedValueOnce(0.49);
    await expect(
      runVerificationPipeline(application, deps),
    ).resolves.toMatchObject({
      decisionBucket: "red",
      livenessStatus: "failed",
      nicFaceScore: null,
    });
  });

  it("skips external work when the account has exceeded its daily limit", async () => {
    const deps = dependencies();
    const output = await runVerificationPipeline(
      { ...job, recentSubmissions24h: 6 },
      deps,
    );
    expect(output.decisionBucket).toBe("amber");
    expect(decodeSmartNicPdf417).not.toHaveBeenCalled();
    expect(deps.checkDuplicates).not.toHaveBeenCalled();
    expect(deps.provider.extractDocument).not.toHaveBeenCalled();
    expect(deps.provider.getLivenessResult).not.toHaveBeenCalled();
  });

  it("skips NIC and licence hashing when no pepper is configured", async () => {
    const deps = dependencies();
    const output = await runVerificationPipeline(await submission(), {
      ...deps,
      config: { ...deps.config, hmacPepper: undefined },
    });
    expect(deps.checkDuplicates).toHaveBeenCalledWith(
      job.accountId,
      null,
      null,
    );
    expect(output.credentials?.nicHmac).toBeUndefined();
    expect(output.decisionBucket).toBe("amber");
  });
});
