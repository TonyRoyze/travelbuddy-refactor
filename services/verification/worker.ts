import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { loadVerificationConfig } from "./config";
import { createVerificationClient } from "./db";
import { runVerificationPipeline } from "./pipeline";
import { createVerificationProvider } from "./providers/in-house";
import { duplicateCheckSchema, jobSchema } from "./types";

const maintenanceIntervalMs = 6 * 60 * 60 * 1000;

export async function runVerificationWorker(
  config = loadVerificationConfig(),
  stop = new AbortController(),
) {
  const { supabaseUrl, supabaseSecretKey } = config;
  if (!config.workerEnabled || !supabaseUrl || !supabaseSecretKey) return;

  const service = createVerificationClient(supabaseUrl, supabaseSecretKey);
  const provider = createVerificationProvider(config);
  let nextSweep = 0;
  while (!stop.signal.aborted) {
    if (Date.now() >= nextSweep) {
      try {
        const { error } = await service.rpc(
          "sweep_buddy_verification_maintenance",
        );
        if (error) throw new Error("Verification maintenance failed.");
        nextSweep = Date.now() + maintenanceIntervalMs;
      } catch {
        console.error("Verification maintenance failed.");
        nextSweep = Date.now() + 60_000;
      }
    }
    if (stop.signal.aborted) break;
    try {
      const { data, error } = await service.rpc("claim_buddy_verification_job");
      if (error) throw new Error("Could not claim verification job.");
      if (data !== null) {
        const lease = jobSchema
          .pick({ jobId: true, leaseId: true })
          .safeParse(data);
        if (!lease.success) throw new Error("Malformed verification lease.");
        const identity = {
          p_job_id: lease.data.jobId,
          p_lease_id: lease.data.leaseId,
        };
        try {
          const job = jobSchema.parse(data);
          const outcome = await runVerificationPipeline(job, {
            config,
            provider,
            checkDuplicates: async (accountId, nicHmac, plate) => {
              const result = await service.rpc(
                "check_buddy_credential_duplicates",
                {
                  p_account_id: accountId,
                  p_nic_hmac: nicHmac,
                  p_plate: plate,
                },
              );
              if (result.error) throw new Error("Could not check credentials.");
              return duplicateCheckSchema.parse(result.data);
            },
          });
          const completed = await service.rpc(
            "complete_buddy_verification_job",
            { ...identity, p_outcome: outcome },
          );
          if (completed.error)
            throw new Error("Could not complete verification job.");
          console.info("Verification job processed.", {
            accountId: job.accountId,
            jobId: job.jobId,
            decisionBucket: outcome.decisionBucket,
            latencyMs: outcome.latencyMs,
          });
          if (
            outcome.livenessStatus &&
            job.livenessSessionId &&
            job.details.faceComparisonConsent &&
            provider.livenessConfigured
          ) {
            await provider
              .deleteLivenessSession(
                job.livenessSessionId,
                job.accountId,
                job.submittedAt,
              )
              .catch(() => {
                console.warn("Verification liveness cleanup failed.", {
                  jobId: job.jobId,
                });
              });
          }
        } catch {
          console.error("Verification job failed.", {
            jobId: lease.data.jobId,
          });
          const failed = await service.rpc("fail_buddy_verification_job", {
            ...identity,
            p_error: "Verification service could not process the job.",
            p_max_attempts: config.maxAttempts,
          });
          if (failed.error)
            throw new Error("Could not record verification job failure.");
        }
      }
    } catch {
      console.error("Verification worker could not process the queue.");
    }
    if (!stop.signal.aborted)
      await setTimeout(config.pollIntervalMs, undefined, {
        signal: stop.signal,
      }).catch(() => {});
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  void runVerificationWorker(undefined, stop)
    .catch(() => {
      console.error("Verification worker configuration is invalid.");
      process.exitCode = 1;
    })
    .finally(() => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
    });
}
