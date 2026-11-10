import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { createApnsSender, type PushJob } from "./apns";

for (const file of [".env.media.local", ".env.push.local"]) {
  if (existsSync(file)) loadEnvFile(file);
}
const names = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "APNS_TEAM_ID",
  "APNS_KEY_ID",
];
const enabled =
  names.every((name) => !!process.env[name]) &&
  !!(process.env.APNS_PRIVATE_KEY || process.env.APNS_PRIVATE_KEY_PATH);
if (!enabled) {
  console.warn(
    "iPhone push delivery is disabled: configure the server APNs settings in .env.push.example.",
  );
} else {
  const environment = process.env.APNS_ENVIRONMENT || "production";
  if (!["sandbox", "production"].includes(environment))
    throw new Error("APNS_ENVIRONMENT must be sandbox or production.");
  const send = createApnsSender({
    teamId: process.env.APNS_TEAM_ID!,
    keyId: process.env.APNS_KEY_ID!,
    topic: process.env.APNS_TOPIC || "com.travelbuddy.app",
    privateKey:
      process.env.APNS_PRIVATE_KEY ||
      readFileSync(process.env.APNS_PRIVATE_KEY_PATH!, "utf8"),
  });
  const service = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      db: { schema: "travelbuddy_api" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const work = async () => {
    try {
      const { data, error } = await service.rpc("claim_message_push", {
        delivery_environment: environment,
      });
      if (error) throw error;
      await Promise.all(
        (data as PushJob[]).map(async (job) => {
          const outcome = await send(job);
          const result = await service.rpc("finish_message_push", {
            job_id: job.id,
            lease_id: job.leaseId,
            outcome,
          });
          if (result.error) throw result.error;
          if (outcome !== "sent")
            console.warn(`iPhone push delivery result: ${outcome}.`);
        }),
      );
    } catch {
      console.error(
        "iPhone push processing failed; check database and APNs configuration.",
      );
    } finally {
      if (!stopped) timer = setTimeout(() => void work(), 5000);
    }
  };
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      stopped = true;
      clearTimeout(timer);
    });
  void work();
}
