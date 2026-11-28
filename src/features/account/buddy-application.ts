import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { mediaApiUrl } from "@/lib/media-api";
import { rpc, supabase } from "@/lib/supabase";
import { normalizeNicNumber } from "./nic-preview";

const statusSchema = z
  .object({
    status: z.enum([
      "pending",
      "manual_review",
      "approved",
      "changes_requested",
      "rejected",
    ]),
    submittedAt: z.string(),
    message: z.string().nullable(),
    decisionSource: z.enum(["automated", "manual"]).nullable().default(null),
    verificationBucket: z
      .enum(["green", "amber", "red"])
      .nullable()
      .default(null),
    canAppeal: z.boolean().default(false),
    canReapply: z.boolean().optional(),
    appealRequestedAt: z.string().nullable().default(null),
    service: z.enum(["local", "guide", "transport"]).nullable().default(null),
    transportEligible: z.boolean().nullable().default(null),
    expiringDocs: z
      .array(
        z.object({
          kind: z.enum([
            "driving_licence",
            "insurance",
            "revenue_licence",
            "sltda",
          ]),
          expiresAt: z.string(),
          daysRemaining: z.number(),
          stage: z.enum(["30d", "7d", "expired"]),
        }),
      )
      .default([]),
  })
  .transform((application) => ({
    ...application,
    canReapply:
      application.canReapply ??
      ["changes_requested", "rejected", "approved"].includes(
        application.status,
      ),
  }));

export type BuddyApplicationStatus = z.infer<typeof statusSchema>;

export function buddyApplicationQuery(accountId?: string) {
  return queryOptions({
    queryKey: ["buddy-application", accountId],
    queryFn: async () =>
      statusSchema.nullable().parse(await rpc("buddy_application_status", {})),
    staleTime: 0,
  });
}

async function encodeImage(file: File) {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        new Error("Could not read an application image. Select it again."),
      );
    reader.readAsDataURL(file);
  });
  return { type: file.type, base64: url.slice(url.indexOf(",") + 1) };
}

export async function submitBuddyApplication(data: FormData) {
  const entries = Array.from(data.entries());
  const application = Object.fromEntries(
    entries.filter(([, value]) => typeof value === "string"),
  );
  if (typeof application.nicNumber === "string") {
    const nicNumber = normalizeNicNumber(application.nicNumber);
    if (nicNumber && application.documentType === "nic")
      application.nicNumber = nicNumber;
    else delete application.nicNumber;
  }
  const images = Object.fromEntries(
    await Promise.all(
      entries.flatMap(([key, value]) =>
        typeof value !== "string" && value.size > 0
          ? [encodeImage(value).then((image) => [key, image] as const)]
          : [],
      ),
    ),
  );
  const faceComparisonConsent = data.get("faceComparisonConsent") === "yes";
  if (!faceComparisonConsent || !application.livenessSessionId)
    delete application.livenessSessionId;

  return statusSchema.parse(
    await rpc("submit_buddy_application", {
      application: {
        ...application,
        faceComparisonConsent,
        thirdPartyVehicle:
          application.service === "transport" &&
          data.get("thirdPartyVehicle") === "yes",
      },
      images,
    }),
  );
}

export async function requestBuddyManualReview() {
  const api = supabase.schema("travelbuddy_api") as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { error } = await api.rpc("request_buddy_manual_review", {});
  if (error) throw new Error(error.message);
}

const configSchema = z.object({
  livenessConfigured: z.boolean(),
  visionConfigured: z.boolean(),
  mode: z.enum(["shadow", "assisted", "auto"]),
  providerMode: z.string(),
});

export async function fetchVerificationConfig() {
  const response = await fetch(mediaApiUrl("/verification-api/config"));
  if (!response.ok) throw new Error("Could not load verification settings.");
  return configSchema.parse(await response.json());
}

const livenessSchema = z.discriminatedUnion("configured", [
  z.object({ configured: z.literal(false) }),
  z.object({
    configured: z.literal(true),
    sessionId: z.string().min(1),
    authToken: z.string().min(1),
    expiresInSeconds: z.number().positive().optional(),
  }),
]);

export async function startLivenessSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sign in again to start a live check.");
  const response = await fetch(
    mediaApiUrl("/verification-api/liveness/session"),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
  );
  if (!response.ok)
    throw new Error(
      "Could not start the live check. You can continue with your selfie.",
    );
  return livenessSchema.parse(await response.json());
}
