import { z } from "zod";

export const imageKinds = [
  "id-front",
  "id-back",
  "selfie",
  "guide-licence",
  "driving-licence-front",
  "driving-licence-back",
  "vehicle",
  "insurance",
  "revenue-licence",
  "owner-authorization",
] as const;
export const imageKindSchema = z.enum(imageKinds);
export type ImageKind = z.infer<typeof imageKindSchema>;
export type DocumentSlot = Exclude<ImageKind, "selfie">;
export const imageSchema = z.object({
  mimeType: z.string(),
  base64: z.string(),
});
export type ApplicationImage = z.infer<typeof imageSchema>;
export const imageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const detailsSchema = z.object({
  displayName: z.string(),
  legalName: z.string(),
  birthDate: z.string(),
  phone: z.string(),
  documentType: z.enum(["nic", "passport"]),
  nicNumber: z.string().nullish(),
  service: z.enum(["local", "guide", "transport"]),
  homeBase: z.string(),
  languages: z.string(),
  intro: z.string(),
  faceComparisonConsent: z.boolean(),
  guideLicence: z.string().nullish(),
  thirdPartyVehicle: z.boolean().nullish(),
});

export const jobSchema = z.object({
  jobId: z.uuid(),
  leaseId: z.uuid(),
  attempts: z.number().int().nonnegative(),
  accountId: z.uuid(),
  submittedAt: z.string(),
  details: detailsSchema,
  livenessSessionId: z.string().nullish(),
  recentSubmissions24h: z.number().int().nonnegative(),
  consecutiveSpoofFailures: z.number().int().nonnegative(),
  images: z.record(z.string(), imageSchema),
});
export type VerificationJob = z.infer<typeof jobSchema>;
export type ApplicationDetails = z.infer<typeof detailsSchema>;
export const duplicateCheckSchema = z.object({
  duplicateNic: z.boolean(),
  duplicatePlate: z.boolean(),
});
export type DuplicateCheck = z.infer<typeof duplicateCheckSchema>;

export const verificationModeSchema = z.enum(["shadow", "assisted", "auto"]);
export const providerModeSchema = z.enum([
  "option_a_inhouse",
  "option_b_hybrid",
]);
export type VerificationMode = z.infer<typeof verificationModeSchema>;
export type ProviderMode = z.infer<typeof providerModeSchema>;

export const ruleOutcomeSchema = z.strictObject({
  code: z.enum([
    "QA-01",
    "QA-02",
    "QA-03",
    "NIC-01",
    "NIC-02",
    "NIC-03",
    "NIC-04",
    "NIC-05",
    "BIO-01",
    "BIO-02",
    "BIO-03",
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
    "SYS-01",
  ]),
  status: z.enum(["pass", "amber", "red"]),
  message: z.string(),
  applicantMessage: z.string().optional(),
  field: z.string().optional(),
});
export type RuleOutcome = z.infer<typeof ruleOutcomeSchema>;
export type DecisionBucket = "green" | "amber" | "red";
export type LivenessStatus =
  "passed" | "spoof" | "failed" | "pending" | "unavailable";

export interface VerificationCredentials {
  service: ApplicationDetails["service"];
  nicHmac?: string;
  dlHmac?: string;
  vehiclePlateNormalized?: string;
  vehicleClass?: string;
  dlExpiresAt?: string;
  insuranceExpiresAt?: string;
  erlExpiresAt?: string;
  sltdaExpiresAt?: string;
}

export interface VerificationOutcome {
  decisionBucket: DecisionBucket;
  shadowMode: boolean;
  effectiveStatus: "approved" | "manual_review" | "changes_requested";
  pipelineVersion: string;
  providerMode: ProviderMode;
  livenessStatus: LivenessStatus | null;
  nicFaceScore: number | null;
  dlFaceScore: number | null;
  pdf417Passed: boolean | null;
  extractedSummary: Record<string, unknown>;
  ruleOutcomes: RuleOutcome[];
  applicantFeedback: string | null;
  credentials?: VerificationCredentials;
  latencyMs: number;
}
