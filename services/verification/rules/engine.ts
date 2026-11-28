import type { VerificationConfig } from "../config";
import type { ImageInspection } from "../image-qa";
import type { parseSriLankanNicPdf417 } from "../barcode/pdf417";
import type { ExtractionBySlot } from "../providers/vision-ai";
import type {
  DecisionBucket,
  DocumentSlot,
  DuplicateCheck,
  ImageKind,
  LivenessStatus,
  RuleOutcome,
  VerificationCredentials,
  VerificationJob,
  VerificationOutcome,
} from "../types";
import {
  evaluateDrivingLicenceRules,
  normalizeVehicleCategory,
} from "./driving-licence";
import { reliableField, requiredEvidence, rule } from "./evidence";
import { compareSriLankanNames } from "./names";
import {
  decodeNic,
  hmacCredential,
  isAtLeast18Colombo,
  isCalendarDate,
  normalizeNic,
} from "./nic";
import { evaluateVehicleRules, normalizePlate } from "./vehicle";

const pipelineVersion = "1";
export const submissionLimit = 5;
export const spoofReviewThreshold = 3;
export type Images = Partial<Record<ImageKind, ImageInspection>>;

export interface RuleEngineInput {
  job: VerificationJob;
  config: Pick<VerificationConfig, "mode" | "providerMode" | "hmacPepper">;
  images: Images;
  extractions: Partial<ExtractionBySlot>;
  barcode: ReturnType<typeof parseSriLankanNicPdf417>;
  livenessStatus: LivenessStatus | null;
  nicFaceScore: number | null;
  dlFaceScore: number | null;
  duplicates?: DuplicateCheck;
  providerFailure: boolean;
  now: Date;
}

export function applicationSlots(job: VerificationJob): ImageKind[] {
  const slots: ImageKind[] = ["id-front", "selfie"];
  if (job.details.documentType === "nic") slots.push("id-back");
  if (job.details.service === "guide") slots.push("guide-licence");
  if (job.details.service === "transport") {
    slots.push(
      "driving-licence-front",
      "driving-licence-back",
      "vehicle",
      "insurance",
      "revenue-licence",
    );
    if (job.images["owner-authorization"]) slots.push("owner-authorization");
  }
  return slots;
}

function expectedType(slot: DocumentSlot, job: VerificationJob) {
  if (slot === "id-front")
    return job.details.documentType === "passport" ? "passport" : "nic-front";
  return slot === "id-back" ? "nic-back" : slot;
}

const imageLabels = {
  "id-front": "front of your identity document",
  "id-back": "back of your identity card",
  selfie: "selfie",
  "guide-licence": "guide licence",
  "driving-licence-front": "front of your driving licence",
  "driving-licence-back": "back of your driving licence",
  vehicle: "vehicle registration certificate",
  insurance: "motor insurance certificate",
  "revenue-licence": "revenue licence",
  "owner-authorization": "signed owner authorization",
} satisfies Record<ImageKind, string>;

const keyFields = {
  "id-front": ["nicNumber", "birthDate", "fullName", "nicFormat"],
  "id-back": [],
  "driving-licence-front": [
    "licenceNumber",
    "nicNumber",
    "birthDate",
    "fullName",
    "expiresAt",
  ],
  "driving-licence-back": ["licenceNumber", "classes"],
  vehicle: ["plate", "vehicleClass", "ownerNic"],
  insurance: ["plate", "insurer", "usage", "expiresAt"],
  "revenue-licence": ["plate", "expiresAt"],
  "guide-licence": ["licenceNumber", "fullName", "category", "expiresAt"],
  "owner-authorization": ["plate", "signed"],
} satisfies Record<DocumentSlot, string[]>;

function usableDocument<K extends DocumentSlot>(
  input: RuleEngineInput,
  slot: K,
): ExtractionBySlot[K] | undefined {
  const document = input.extractions[slot];
  return document?.detectedDocumentType === expectedType(slot, input.job)
    ? document
    : undefined;
}

export function extractCredentialKeys(
  input: Pick<RuleEngineInput, "job" | "config" | "extractions" | "barcode">,
) {
  const { job, config, barcode } = input;
  const id = input.extractions["id-front"];
  const card =
    id?.detectedDocumentType === "nic-front"
      ? requiredEvidence(id, "nicNumber", id.fields.nicNumber)
      : undefined;
  const nic = normalizeNic(card ?? barcode?.nicNumber ?? job.details.nicNumber);
  const vehicle = input.extractions.vehicle;
  const plate =
    job.details.service === "transport" &&
    vehicle?.detectedDocumentType === "vehicle"
      ? normalizePlate(requiredEvidence(vehicle, "plate", vehicle.fields.plate))
      : null;
  return { nicHmac: hmacCredential(nic, config.hmacPepper), plate };
}

function biometricRules(input: RuleEngineInput, old: boolean) {
  const { job, livenessStatus, nicFaceScore, dlFaceScore } = input;
  if (!job.details.faceComparisonConsent)
    return [
      rule("BIO-01", "amber", "Applicant chose manual review for biometrics."),
    ];

  const scores = [nicFaceScore, dlFaceScore].filter(
    (score): score is number => score !== null,
  );
  const best = scores.length ? Math.max(...scores) : null;
  const dlFailed = dlFaceScore !== null && dlFaceScore < 0.5;
  const nicFailed = nicFaceScore !== null && nicFaceScore < 0.5;
  const spoof = livenessStatus === "spoof";
  const escalate =
    job.consecutiveSpoofFailures +
      Number(spoof || livenessStatus === "failed") >=
    spoofReviewThreshold;
  const liveness = escalate
    ? "amber"
    : livenessStatus === "passed"
      ? "pass"
      : livenessStatus === "failed" || spoof
        ? "red"
        : "amber";
  const face =
    best === null
      ? "amber"
      : best < 0.5
        ? old
          ? "amber"
          : "red"
        : dlFailed || (!old && nicFailed)
          ? "amber"
          : best >= 0.75
            ? "pass"
            : "amber";

  return [
    rule("BIO-01", "pass", "Applicant consented to biometric comparison."),
    rule(
      "BIO-02",
      liveness,
      escalate
        ? "Repeated liveness failures need review."
        : "Liveness assessment completed.",
      "selfie",
      liveness === "red"
        ? "Retake your live selfie in good lighting."
        : undefined,
    ),
    rule(
      "BIO-03",
      escalate && face === "red" ? "amber" : face,
      "Best available face comparison score evaluated.",
      "selfie",
      !escalate && face === "red"
        ? "Retake your selfie with your full face visible and upload a clear photo of your own identity document."
        : undefined,
    ),
  ];
}

function getEffectiveStatus(
  bucket: DecisionBucket,
  mode: VerificationConfig["mode"],
): VerificationOutcome["effectiveStatus"] {
  if (mode === "shadow" || bucket === "amber") return "manual_review";
  if (bucket === "red") return "changes_requested";
  return mode === "auto" ? "approved" : "manual_review";
}

function finish(
  input: RuleEngineInput,
  ruleOutcomes: RuleOutcome[],
  extractedSummary: Record<string, unknown>,
  pdf417Passed: boolean | null,
  credentials?: VerificationCredentials,
): Omit<VerificationOutcome, "latencyMs"> {
  const decisionBucket = ruleOutcomes.some(({ status }) => status === "red")
    ? "red"
    : ruleOutcomes.some(({ status }) => status === "amber")
      ? "amber"
      : "green";
  const effectiveStatus = getEffectiveStatus(decisionBucket, input.config.mode);
  const feedback = ruleOutcomes.flatMap(({ status, applicantMessage }) =>
    status === "red" && applicantMessage ? [applicantMessage] : [],
  );
  let applicantFeedback: string | null = null;
  if (effectiveStatus === "changes_requested") {
    // The decision RPC accepts up to 1000 characters. Keep complete instructions.
    let instructions = "";
    for (const item of new Set(feedback)) {
      if (instructions.length + item.length + 1 <= 1000)
        instructions = instructions ? `${instructions} ${item}` : item;
    }
    applicantFeedback =
      instructions ||
      "Check your application and upload clear, current identity documents.";
  }
  return {
    decisionBucket,
    effectiveStatus,
    shadowMode: input.config.mode === "shadow",
    pipelineVersion,
    providerMode: input.config.providerMode,
    livenessStatus: input.livenessStatus,
    nicFaceScore: input.nicFaceScore,
    dlFaceScore: input.dlFaceScore,
    pdf417Passed,
    extractedSummary,
    ruleOutcomes,
    applicantFeedback,
    ...(credentials && { credentials }),
  };
}

export function evaluateVerificationRules(
  input: RuleEngineInput,
): Omit<VerificationOutcome, "latencyMs"> {
  const { job, config, now, barcode, duplicates } = input;
  const { details } = job;
  if (job.recentSubmissions24h > submissionLimit)
    return finish(
      input,
      [rule("SYS-01", "amber", "Daily automated submission limit exceeded.")],
      {},
      null,
    );

  const outcomes: RuleOutcome[] = [];
  let uncertain =
    input.providerFailure ||
    !duplicates ||
    config.providerMode !== "option_a_inhouse";
  for (const slot of applicationSlots(job)) {
    const image = input.images[slot];
    const document = slot === "selfie" ? undefined : input.extractions[slot];
    if (
      slot !== "selfie" &&
      !(slot === "id-front" && details.documentType === "passport")
    ) {
      uncertain ||=
        !document ||
        document.overallConfidence < 0.8 ||
        keyFields[slot].some((field) => !reliableField(document, field));
    }
    const confidentDocument = !!document && document.overallConfidence >= 0.8;
    const qaFailed =
      !image?.decodable ||
      image.isTooSmall ||
      image.isBlurry ||
      (confidentDocument && document.qualityFlags.includes("blur"));
    outcomes.push(
      rule(
        "QA-01",
        qaFailed ? "red" : "pass",
        "Image resolution and clarity checked.",
        slot,
        qaFailed
          ? `Upload a clear photo of your ${imageLabels[slot]} at least 640 pixels wide.`
          : undefined,
      ),
    );
    if (slot !== "selfie" && !qaFailed) {
      const detected = document?.detectedDocumentType;
      const status =
        !confidentDocument || detected === "unknown"
          ? "amber"
          : detected === expectedType(slot, job)
            ? "pass"
            : "red";
      outcomes.push(
        rule(
          "QA-02",
          status,
          "Detected document type compared with the upload slot.",
          slot,
          status === "red"
            ? `Upload your ${imageLabels[slot]} in the correct field.`
            : undefined,
        ),
      );
    }
    const imageConcerns =
      image?.hasHeavyGlare ||
      document?.qualityFlags.some((flag) => flag !== "blur");
    outcomes.push(
      rule(
        "QA-03",
        imageConcerns ? "amber" : "pass",
        "Image quality and presentation signals checked.",
        slot,
      ),
    );
  }

  const id = usableDocument(input, "id-front");
  const cardNumber = requiredEvidence(id, "nicNumber", id?.fields.nicNumber);
  const cardDob = requiredEvidence(id, "birthDate", id?.fields.birthDate);
  const nicFormat = requiredEvidence(id, "nicFormat", id?.fields.nicFormat);
  const nicName = requiredEvidence(id, "fullName", id?.fields.fullName);
  const formNic = normalizeNic(details.nicNumber);
  const old =
    nicFormat === "old" ||
    (!nicFormat && /[VX]$/i.test(cardNumber ?? details.nicNumber ?? ""));
  const smart =
    details.documentType === "nic" &&
    (nicFormat === "smart" || (!old && normalizeNic(cardNumber) !== null));
  const canonicalNic = normalizeNic(cardNumber ?? details.nicNumber);
  const decoded = decodeNic(cardNumber ?? details.nicNumber);
  let pdf417Passed: boolean | null = null;
  if (details.documentType === "nic") {
    const invalidForm =
      !!details.nicNumber &&
      (!formNic || decodeNic(formNic)?.birthDate !== details.birthDate);
    const invalidCard =
      (!!cardNumber && (!decoded || decoded.birthDate !== details.birthDate)) ||
      (!!cardDob && cardDob !== details.birthDate) ||
      (!!formNic && !!cardNumber && canonicalNic !== formNic);
    const enoughEvidence = !!cardNumber && !!cardDob && !!nicFormat;
    outcomes.push(
      rule(
        "NIC-01",
        invalidForm ||
          invalidCard ||
          !isAtLeast18Colombo(details.birthDate, now)
          ? "red"
          : enoughEvidence
            ? "pass"
            : "amber",
        "NIC structure, date of birth and minimum age checked.",
        "id-front",
        "Check your date of birth and upload a clear photo of your own identity card. Applicants must be at least 18.",
      ),
    );
    if (smart) {
      const barcodeNic = decodeNic(barcode?.nicNumber);
      pdf417Passed =
        !!barcodeNic && !!cardNumber
          ? barcodeNic.normalized === canonicalNic &&
            (!barcode?.birthDate || barcode.birthDate === details.birthDate)
          : null;
      outcomes.push(
        rule(
          "NIC-02",
          pdf417Passed === false ? "red" : pdf417Passed ? "pass" : "amber",
          "Smart NIC barcode compared with the front.",
          "id-back",
          "Upload new photos of both sides of the same identity card.",
        ),
      );
      outcomes.push(
        rule(
          "NIC-03",
          barcodeNic ? "pass" : "amber",
          "Smart NIC barcode readability checked.",
          "id-back",
        ),
      );
    }
    if (old)
      outcomes.push(
        rule(
          "NIC-04",
          enoughEvidence && nicName ? "pass" : "amber",
          "Laminated identity card legibility checked.",
          "id-front",
        ),
      );
    outcomes.push(
      rule(
        "NIC-05",
        duplicates?.duplicateNic === false && !!config.hmacPepper
          ? "pass"
          : "amber",
        duplicates?.duplicateNic
          ? "Identity is associated with another account."
          : "Identity duplicate check evaluated.",
        "id-front",
      ),
    );
    uncertain ||=
      !nicName || !compareSriLankanNames(details.legalName, nicName);
  } else {
    uncertain = true;
  }
  outcomes.push(...biometricRules(input, old));

  const credentials: VerificationCredentials = { service: details.service };
  if (
    details.documentType === "nic" &&
    decoded &&
    decoded.birthDate === details.birthDate
  )
    credentials.nicHmac = hmacCredential(decoded.normalized, config.hmacPepper);
  if (details.service === "transport") {
    const front = usableDocument(input, "driving-licence-front");
    const back = usableDocument(input, "driving-licence-back");
    const vehicle = usableDocument(input, "vehicle");
    const insurance = usableDocument(input, "insurance");
    const revenue = usableDocument(input, "revenue-licence");
    const authorization = usableDocument(input, "owner-authorization");
    const vehicleClass = normalizeVehicleCategory(
      requiredEvidence(vehicle, "vehicleClass", vehicle?.fields.vehicleClass),
      requiredEvidence(
        vehicle,
        "seatingCapacity",
        vehicle?.fields.seatingCapacity,
      ),
      requiredEvidence(vehicle, "grossWeightKg", vehicle?.fields.grossWeightKg),
    );
    outcomes.push(
      ...evaluateDrivingLicenceRules({
        front,
        back,
        canonicalNic,
        birthDate: details.birthDate,
        legalName: details.legalName,
        nicName,
        vehicleClass,
        now,
      }),
    );
    outcomes.push(
      ...evaluateVehicleRules({
        vehicle,
        insurance,
        revenue,
        authorization,
        canonicalNic,
        thirdPartyVehicle: details.thirdPartyVehicle,
        duplicatePlate: duplicates?.duplicatePlate,
        now,
      }),
    );
    const licence = requiredEvidence(
      front,
      "licenceNumber",
      front?.fields.licenceNumber,
    )
      ?.toUpperCase()
      .replace(/[\s-]/g, "");
    credentials.dlHmac = hmacCredential(licence, config.hmacPepper);
    credentials.vehiclePlateNormalized =
      normalizePlate(
        requiredEvidence(vehicle, "plate", vehicle?.fields.plate),
      ) ?? undefined;
    credentials.vehicleClass = vehicleClass ?? undefined;
    const dlExpiry = requiredEvidence(
      front,
      "expiresAt",
      front?.fields.expiresAt,
    );
    const insExpiry = requiredEvidence(
      insurance,
      "expiresAt",
      insurance?.fields.expiresAt,
    );
    const erlExpiry = requiredEvidence(
      revenue,
      "expiresAt",
      revenue?.fields.expiresAt,
    );
    if (dlExpiry && isCalendarDate(dlExpiry))
      credentials.dlExpiresAt = dlExpiry;
    if (insExpiry && isCalendarDate(insExpiry))
      credentials.insuranceExpiresAt = insExpiry;
    if (erlExpiry && isCalendarDate(erlExpiry))
      credentials.erlExpiresAt = erlExpiry;
    uncertain ||=
      !licence ||
      !credentials.dlExpiresAt ||
      !credentials.insuranceExpiresAt ||
      !credentials.erlExpiresAt;
  }
  if (details.service === "guide") {
    const guide = usableDocument(input, "guide-licence");
    const expiry = requiredEvidence(
      guide,
      "expiresAt",
      guide?.fields.expiresAt,
    );
    if (expiry && isCalendarDate(expiry)) credentials.sltdaExpiresAt = expiry;
    // Licence authenticity and the scope of the guide registration need operator review.
    uncertain = true;
  }

  // Only known rule codes, numeric signals, and trusted slot identifiers survive extraction.
  const summary: Record<string, unknown> = {};
  for (const slot of applicationSlots(job)) {
    const image = input.images[slot];
    const document = slot === "selfie" ? undefined : input.extractions[slot];
    if (image)
      summary[slot] = {
        width: image.width,
        height: image.height,
        sharpnessScore: image.sharpnessScore,
        glareRatio: image.glareRatio,
        detectedDocumentType: document?.detectedDocumentType,
        qualityFlags: document?.qualityFlags,
        overallConfidence: document?.overallConfidence,
      };
  }
  const evidenceUncertain = outcomes.some(
    ({ status, code }) =>
      status === "amber" &&
      ["NIC-01", "DL-01", "DL-03", "VEH-01", "VEH-02", "VEH-05"].includes(code),
  );
  outcomes.push(
    rule(
      "SYS-01",
      uncertain || evidenceUncertain ? "amber" : "pass",
      "Provider availability and evidence confidence evaluated.",
    ),
  );
  return finish(input, outcomes, summary, pdf417Passed, credentials);
}
