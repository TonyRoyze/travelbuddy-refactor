import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

const require = createRequire(import.meta.url);
const viteCli = join(
  dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);

function startService(name: string, entry: string, envFiles: string[]) {
  const env = { ...process.env };
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(
      parseEnv(readFileSync(file, "utf8")),
    )) {
      if (env[key] === undefined) env[key] = value;
    }
  }
  const missing = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ].filter((key) => !env[key]);
  if (missing.length) {
    console.warn(
      `[dev] Skipping ${name}: missing ${missing.join(", ")}. Configure ${envFiles.join(" or ")} to enable this service.`,
    );
    return null;
  }
  return spawn(process.execPath, ["--import", "tsx", entry], {
    stdio: "inherit",
    env,
  });
}

// Launch Node directly so Windows does not need to execute pnpm's .cmd shim.
const children = [
  spawn(process.execPath, [viteCli, "--host", "0.0.0.0"], { stdio: "inherit" }),
  startService("profile uploads", "services/profile-media/server.ts", [
    ".env.media.local",
  ]),
  startService("payments", "services/payments/server.ts", [
    ".env.media.local",
    ".env.payments.local",
  ]),
].filter((child) => child !== null);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => {
  child.on("error", (error) => {
    console.error("Failed to start a development service:", error);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
});
