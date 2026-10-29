import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { loadEnv } from "vite";
import { checkUploadProject } from "../services/profile-media/config";

const browser = loadEnv("development", process.cwd(), "VITE_");
const media = {
  ...(existsSync(".env.media.local")
    ? parseEnv(readFileSync(".env.media.local", "utf8"))
    : {}),
  ...process.env,
};
if (
  browser.VITE_SUPABASE_URL &&
  browser.VITE_SUPABASE_PUBLISHABLE_KEY &&
  media.SUPABASE_URL &&
  media.SUPABASE_PUBLISHABLE_KEY
) {
  await checkUploadProject(
    {
      url: browser.VITE_SUPABASE_URL,
      key: browser.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    { url: media.SUPABASE_URL, key: media.SUPABASE_PUBLISHABLE_KEY },
  );
}

const children = [
  spawn("pnpm", ["exec", "vite", "--host", "0.0.0.0"], { stdio: "inherit" }),
  spawn("pnpm", ["media:serve"], { stdio: "inherit" }),
  spawn("pnpm", ["payments:serve"], { stdio: "inherit" }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) =>
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  }),
);
