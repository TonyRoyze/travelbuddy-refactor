import { z } from "zod";
import { mediaApiUrl } from "@/lib/media-api";
import { supabase } from "@/lib/supabase";
import type { BuddyApplicationStatus } from "@/features/account/buddy-application";

const status = z.enum([
  "pending",
  "manual_review",
  "approved",
  "changes_requested",
  "rejected",
]);
const bucket = z.enum(["green", "amber", "red"]);
const imageType = z.enum(["image/jpeg", "image/png", "image/webp"]);
const summary = z.record(z.string(), z.unknown());

export const imageLabels = {
  selfie: "Selfie",
  "id-front": "Identity document front",
  "id-back": "Identity document back",
  "guide-licence": "Guide licence",
  "driving-licence-front": "Driving licence front",
  "driving-licence-back": "Driving licence back",
  "driving-licence": "Driving licence",
  vehicle: "Vehicle registration",
  insurance: "Vehicle insurance",
  "revenue-licence": "Revenue licence",
  "owner-authorization": "Owner authorization",
};

export type ImageKind = keyof typeof imageLabels;
export type QueueFilter =
  BuddyApplicationStatus["status"] | "needs_review" | "all";
export type Decision = "approved" | "changes_requested" | "rejected";

const runSchema = z.object({
  id: z.string(),
  decisionBucket: bucket,
  shadowMode: z.boolean(),
  pipelineVersion: z.string(),
  livenessStatus: z.string().nullable(),
  nicFaceScore: z.number().nullable(),
  dlFaceScore: z.number().nullable(),
  pdf417Passed: z.boolean().nullable(),
  latencyMs: z.number(),
  createdAt: z.string(),
});

const queueRowSchema = z.object({
  accountId: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  status,
  service: z.string().nullable(),
  documentType: z.string().nullable(),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  reviewMessage: z.string().nullable(),
  decisionSource: z.enum(["automated", "manual"]).nullable(),
  verificationBucket: bucket.nullable(),
  appealRequestedAt: z.string().nullable(),
  hasImages: z.boolean(),
  imageKinds: z.array(z.enum(Object.keys(imageLabels) as ImageKind[])),
  jobStatus: z.string().nullable(),
});

const detailSchema = queueRowSchema.extend({
  details: summary,
  credentials: z
    .object({ vehiclePlateNormalized: z.string().nullable() })
    .nullable(),
  runs: z.array(
    runSchema.extend({
      providerMode: z.string(),
      ruleOutcomes: z.array(
        z.object({
          code: z.string(),
          status: z.enum(["pass", "amber", "red"]),
          message: z.string(),
        }),
      ),
      extractedSummary: summary,
      applicantFeedback: z.string().nullable(),
    }),
  ),
});

export type VerificationApplication = z.infer<typeof detailSchema>;
export type VerificationRun = VerificationApplication["runs"][number];

async function verificationRpc(fn: string, args: Record<string, unknown>) {
  const api = supabase.schema("travelbuddy_api") as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await api.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function listApplications(filter: QueueFilter) {
  return z
    .array(queueRowSchema)
    .parse(
      await verificationRpc("admin_list_buddy_applications", {
        status_filter: filter,
      }),
    );
}

export async function getApplication(accountId: string) {
  return detailSchema.parse(
    await verificationRpc("admin_get_buddy_application", {
      applicant_id: accountId,
    }),
  );
}

export interface AdminDecisionCredentials {
  vehiclePlateNormalized?: string | null;
  vehicleClass?: string | null;
  dlExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  erlExpiresAt?: string | null;
  sltdaExpiresAt?: string | null;
}

export async function reviewApplication(
  accountId: string,
  submission: string,
  decision: Decision,
  message: string,
  credentials?: AdminDecisionCredentials | null,
) {
  const reason = message.trim();
  if (decision !== "approved" && !reason)
    throw new Error("Enter a reason for the applicant.");
  await verificationRpc("admin_review_buddy_application", {
    applicant_id: accountId,
    submission,
    decision,
    message: reason || null,
    ...(decision === "approved" && credentials ? { credentials } : {}),
  });
}

export async function requeueApplication(
  accountId: string,
  submission: string,
) {
  await verificationRpc("admin_requeue_buddy_verification", {
    applicant_id: accountId,
    submission,
  });
}

export async function loadApplicationImage(
  accountId: string,
  kind: ImageKind,
  submission: string,
  signal: AbortSignal,
) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session)
    throw new Error("Sign in again to access application photos.");

  const path = `/verification-api/admin/applications/${encodeURIComponent(accountId)}/images/${encodeURIComponent(kind)}?submittedAt=${encodeURIComponent(submission)}`;
  let response: Response | undefined;
  try {
    response = await fetch(mediaApiUrl(path), {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
  }
  if (response?.status === 401 || response?.status === 403) {
    throw new Error(
      "Administrator access is required to view application photos.",
    );
  }
  if (
    response?.ok &&
    imageType.safeParse(response.headers.get("content-type")?.split(";")[0])
      .success
  ) {
    return response.blob();
  }

  signal.throwIfAborted();
  const image = z
    .object({ mimeType: imageType, base64: z.string() })
    .nullable()
    .parse(
      await verificationRpc("admin_buddy_application_image", {
        applicant_id: accountId,
        image_kind: kind,
        submission,
      }),
    );
  signal.throwIfAborted();
  if (!image) return null;
  const decoded = Uint8Array.from(atob(image.base64), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([decoded], { type: image.mimeType });
}
