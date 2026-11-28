import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buddyApplicationQuery,
  fetchVerificationConfig,
  requestBuddyManualReview,
  startLivenessSession,
  submitBuddyApplication,
} from "./buddy-application";

const { rpc, newRpc, getSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  newRpc: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  rpc,
  supabase: {
    schema: () => ({ rpc: newRpc }),
    auth: { getSession },
  },
}));

const baseStatus = {
  status: "pending",
  submittedAt: "2026-11-28T00:00:00Z",
  message: null,
};
const fullStatus = {
  ...baseStatus,
  status: "changes_requested",
  message: "Use a clearer image.",
  decisionSource: "automated",
  verificationBucket: "red",
  canAppeal: true,
  canReapply: true,
  appealRequestedAt: null,
  service: "transport",
  transportEligible: false,
  expiringDocs: [
    {
      kind: "insurance",
      expiresAt: "2026-11-29",
      stage: "7d",
      daysRemaining: 1,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue(baseStatus);
});
afterEach(() => vi.unstubAllGlobals());

describe("buddy application API", () => {
  it("preserves the enriched status payload", async () => {
    rpc.mockResolvedValue(fullStatus);
    await expect(
      new QueryClient().fetchQuery(buddyApplicationQuery("account")),
    ).resolves.toEqual(fullStatus);
  });

  it("serializes transport uploads and explicit consent and ownership booleans", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        result?: string;
        onload?: () => void;
        async readAsDataURL(file: File) {
          this.result = `data:${file.type};base64,${btoa(await file.text())}`;
          this.onload?.();
        }
      },
    );
    const form = new FormData();
    form.set("documentType", "nic");
    form.set("nicNumber", " 90 061-1234v ");
    form.set("service", "transport");
    form.set("faceComparisonConsent", "yes");
    form.set("thirdPartyVehicle", "yes");
    form.set("livenessSessionId", "session-1");
    const kinds = [
      "id-front",
      "id-back",
      "selfie",
      "driving-licence-front",
      "driving-licence-back",
      "vehicle",
      "insurance",
      "revenue-licence",
      "owner-authorization",
    ];
    for (const kind of kinds)
      form.set(
        kind,
        new File(["photo"], `${kind}.jpg`, { type: "image/jpeg" }),
      );
    await expect(submitBuddyApplication(form)).resolves.toMatchObject({
      status: "pending",
      expiringDocs: [],
    });
    expect(rpc).toHaveBeenCalledWith("submit_buddy_application", {
      application: {
        documentType: "nic",
        nicNumber: "900611234V",
        service: "transport",
        faceComparisonConsent: true,
        thirdPartyVehicle: true,
        livenessSessionId: "session-1",
      },
      images: Object.fromEntries(
        kinds.map((kind) => [kind, { type: "image/jpeg", base64: "cGhvdG8=" }]),
      ),
    });
  });

  it("omits inapplicable NIC and liveness fields and defaults consent to false", async () => {
    const form = new FormData();
    form.set("documentType", "passport");
    form.set("service", "guide");
    form.set("guideLicence", "licence");
    form.set("nicNumber", "900611234V");
    form.set("livenessSessionId", "unused");
    await submitBuddyApplication(form);
    expect(rpc).toHaveBeenCalledWith("submit_buddy_application", {
      application: {
        documentType: "passport",
        service: "guide",
        guideLicence: "licence",
        faceComparisonConsent: false,
        thirdPartyVehicle: false,
      },
      images: {},
    });
  });

  it("requests an authenticated manual review and surfaces RPC errors", async () => {
    newRpc
      .mockResolvedValueOnce({ data: fullStatus, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "This application cannot be appealed." },
      });
    await expect(requestBuddyManualReview()).resolves.toBeUndefined();
    expect(newRpc).toHaveBeenCalledWith("request_buddy_manual_review", {});
    await expect(requestBuddyManualReview()).rejects.toThrow(
      "cannot be appealed",
    );
  });

  it("loads configuration and starts liveness using the account JWT", async () => {
    const config = {
      livenessConfigured: true,
      visionConfigured: true,
      mode: "shadow",
      providerMode: "option_a_inhouse",
    };
    const session = {
      configured: true,
      sessionId: "session-1",
      authToken: "short-lived",
      expiresInSeconds: 60,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(config))
      .mockResolvedValueOnce(Response.json(session));
    vi.stubGlobal("fetch", fetchMock);
    getSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
    await expect(fetchVerificationConfig()).resolves.toEqual(config);
    await expect(startLivenessSession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith("/verification-api/config");
    expect(fetchMock).toHaveBeenCalledWith(
      "/verification-api/liveness/session",
      {
        method: "POST",
        headers: { Authorization: "Bearer access-token" },
      },
    );
  });
});
