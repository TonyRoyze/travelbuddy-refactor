import {
  decodeSmartNicPdf417,
  parseSriLankanNicPdf417,
} from "./barcode/pdf417";
import type { VerificationConfig } from "./config";
import { inspectApplicationImage } from "./image-qa";
import type { IdentityVerificationProvider } from "./providers/interface";
import {
  applicationSlots,
  evaluateVerificationRules,
  extractCredentialKeys,
  submissionLimit,
  type RuleEngineInput,
} from "./rules/engine";
import type {
  DocumentSlot,
  DuplicateCheck,
  VerificationJob,
  VerificationOutcome,
} from "./types";

export interface PipelineDependencies {
  config: Pick<VerificationConfig, "mode" | "providerMode" | "hmacPepper">;
  provider: IdentityVerificationProvider;
  checkDuplicates(
    accountId: string,
    nicHmac: string | null,
    plate: string | null,
  ): Promise<DuplicateCheck>;
  now?: () => Date;
}

export async function runVerificationPipeline(
  job: VerificationJob,
  deps: PipelineDependencies,
): Promise<VerificationOutcome> {
  const started = performance.now();
  const deadline = AbortSignal.timeout(95_000);
  const input: RuleEngineInput = {
    job,
    config: deps.config,
    images: {},
    extractions: {},
    barcode: null,
    livenessStatus: null,
    nicFaceScore: null,
    dlFaceScore: null,
    providerFailure: false,
    now: deps.now?.() ?? new Date(),
  };
  const finish = () => ({
    ...evaluateVerificationRules(input),
    latencyMs: Math.round(performance.now() - started),
  });
  if (job.recentSubmissions24h > submissionLimit) return finish();

  const slots = applicationSlots(job);
  await Promise.all(
    slots.map(async (slot) => {
      const image = job.images[slot];
      if (image)
        input.images[slot] = await inspectApplicationImage(
          image.base64,
          image.mimeType,
        );
    }),
  );

  const withinProvider = async <T>(
    request: () => Promise<T>,
  ): Promise<T | null> => {
    try {
      return await request();
    } catch {
      input.providerFailure = true;
      return null;
    }
  };

  const extract = async (slot: DocumentSlot) => {
    const image = input.images[slot];
    if (!image?.normalizedJpegBase64 || image.isTooSmall || image.isBlurry)
      return;
    const document = await withinProvider(() =>
      deps.provider.extractDocument(
        slot,
        image.normalizedJpegBase64!,
        deadline,
        job.details.documentType === "passport",
      ),
    );
    // The provider validates each response against the schema for its requested slot.
    if (document) Object.assign(input.extractions, { [slot]: document });
    else input.providerFailure = true;
  };

  const decodeBarcode = async () => {
    const back = input.images["id-back"];
    if (
      job.details.documentType !== "nic" ||
      !back?.decodable ||
      back.isTooSmall
    )
      return;
    const raw = await withinProvider(() =>
      decodeSmartNicPdf417(back.originalBuffer),
    );
    if (raw) input.barcode = parseSriLankanNicPdf417(raw);
  };

  const compareFaces = async () => {
    if (!job.details.faceComparisonConsent) return;
    input.livenessStatus = "unavailable";
    if (!deps.provider.livenessConfigured) return;

    const selfie = input.images.selfie?.normalizedJpegBuffer;
    if (!selfie) return;

    if (job.livenessSessionId) {
      const result = await withinProvider(() =>
        deps.provider.getLivenessResult(
          job.livenessSessionId!,
          job.accountId,
          job.submittedAt,
          deadline,
        ),
      );
      if (result) {
        if (result.status === "failed" || result.status === "spoof") {
          input.livenessStatus = result.status;
          return;
        }
        if (result.status === "passed" && result.sessionImageId) {
          const frame = await withinProvider(() =>
            deps.provider.getLivenessImage(result.sessionImageId!, deadline),
          );
          if (frame) {
            const binding = await withinProvider(() =>
              deps.provider.verifyFace(selfie, frame, deadline),
            );
            // A positive verdict must belong to the person in the submitted selfie.
            if (binding !== null && binding < 0.5) {
              input.livenessStatus = "failed";
              return;
            }
            if (binding !== null && binding >= 0.75) {
              input.livenessStatus = "passed";
            }
          }
        }
      }
    }

    const compare = (target: Buffer) =>
      withinProvider(() => deps.provider.verifyFace(selfie, target, deadline));
    const id = input.images["id-front"]?.normalizedJpegBuffer;
    const dl = input.images["driving-licence-front"]?.normalizedJpegBuffer;
    [input.nicFaceScore, input.dlFaceScore] = await Promise.all([
      id ? compare(id) : null,
      job.details.service === "transport" && dl ? compare(dl) : null,
    ]);
  };

  await Promise.all([
    Promise.all(slots.filter((slot) => slot !== "selfie").map(extract)),
    decodeBarcode(),
    compareFaces(),
  ]);
  const { nicHmac, plate } = extractCredentialKeys(input);
  if (!deadline.aborted) {
    input.duplicates =
      (await withinProvider(() =>
        deps.checkDuplicates(job.accountId, nicHmac ?? null, plate),
      )) ?? undefined;
  } else {
    input.providerFailure = true;
  }
  return finish();
}
