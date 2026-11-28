import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVerificationConfig } from "./config";
import { job } from "./fixtures.test-support";
import { runVerificationWorker } from "./worker";

const config = loadVerificationConfig({
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SECRET_KEY: "fixture",
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verification worker", () => {
  it("exits without network activity when disabled or missing credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    await runVerificationWorker(loadVerificationConfig({}));
    await runVerificationWorker({ ...config, workerEnabled: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sweeps maintenance, claims one job, checks duplicate credentials and completes the lease", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const stop = new AbortController();
    const calls: Array<{ rpc: string; input: unknown }> = [];
    const fetcher: typeof fetch = async (request, init) => {
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      const rpc = url.pathname.split("/").at(-1) ?? "";
      calls.push({
        rpc,
        input: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      expect(new Headers(init?.headers).get("content-profile")).toBe(
        "travelbuddy_api",
      );
      switch (rpc) {
        case "sweep_buddy_verification_maintenance":
          return Response.json({ purgedApplications: 0, expiryNotices: [] });
        case "claim_buddy_verification_job":
          return Response.json(job);
        case "check_buddy_credential_duplicates":
          return Response.json({ duplicateNic: false, duplicatePlate: false });
        case "complete_buddy_verification_job":
          stop.abort();
          return Response.json({ applied: true });
        default:
          throw new Error("Unexpected RPC in verification test.");
      }
    };
    vi.stubGlobal("fetch", fetcher);
    await runVerificationWorker(config, stop);
    expect(calls.map(({ rpc }) => rpc)).toEqual([
      "sweep_buddy_verification_maintenance",
      "claim_buddy_verification_job",
      "check_buddy_credential_duplicates",
      "complete_buddy_verification_job",
    ]);
    expect(calls[2].input).toEqual({
      p_account_id: job.accountId,
      p_nic_hmac: null,
      p_plate: null,
    });
    expect(calls[3].input).toMatchObject({
      p_job_id: job.jobId,
      p_lease_id: job.leaseId,
      p_outcome: {
        decisionBucket: "red",
        effectiveStatus: "changes_requested",
      },
    });
  });

  it("sanitizes a malformed claimed job and reports failure using only the valid lease identity", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = new AbortController();
    const calls: unknown[] = [];
    const fetcher: typeof fetch = async (request, init) => {
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      if (url.pathname.endsWith("sweep_buddy_verification_maintenance"))
        return Response.json({ purgedApplications: 0, expiryNotices: [] });
      if (url.pathname.endsWith("claim_buddy_verification_job"))
        return Response.json({
          ...job,
          details: { legalName: "private fixture" },
        });
      calls.push(JSON.parse(String(init?.body)));
      stop.abort();
      return Response.json({ attempts: 1 });
    };
    vi.stubGlobal("fetch", fetcher);
    await runVerificationWorker(config, stop);
    expect(calls).toEqual([
      {
        p_job_id: job.jobId,
        p_lease_id: job.leaseId,
        p_error: "Verification service could not process the job.",
        p_max_attempts: 3,
      },
    ]);
    expect(console.error).toHaveBeenCalledWith("Verification job failed.", {
      jobId: job.jobId,
    });
  });
});
