import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { providerModeSchema, verificationModeSchema } from "./types";

function readLocalEnv(path: string) {
  try {
    return Object.fromEntries(
      Object.entries(parseEnv(readFileSync(path, "utf8"))).filter(
        ([, value]) => value !== "",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("Unable to read verification environment files.", {
      cause: error,
    });
  }
}

function httpsOrigin(value: string, variable: string) {
  if (!/^https:\/\/[a-z0-9][a-z0-9.-]*(?::\d+)?\/?$/i.test(value))
    throw new Error(`${variable} must be an HTTPS origin.`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${variable} must be an HTTPS origin.`);
  }
}

function numberSetting(
  value: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
) {
  if (!value) return fallback;
  const number = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < min ||
    number > max
  )
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return number;
}

export function loadVerificationConfig(env?: NodeJS.ProcessEnv) {
  const settings = env ?? {
    ...readLocalEnv(".env.media.local"),
    ...readLocalEnv(".env.verification.local"),
    ...process.env,
  };
  const mode = verificationModeSchema.safeParse(
    settings.VERIFICATION_MODE ?? "auto",
  );
  if (!mode.success) throw new Error("Invalid VERIFICATION_MODE.");
  const providerMode = providerModeSchema.safeParse(
    settings.VERIFICATION_PROVIDER_MODE ?? "option_a_inhouse",
  );
  if (!providerMode.success)
    throw new Error("Invalid VERIFICATION_PROVIDER_MODE.");

  const faceEndpoint =
    settings.AZURE_FACE_ENDPOINT &&
    httpsOrigin(settings.AZURE_FACE_ENDPOINT, "AZURE_FACE_ENDPOINT");
  if (
    faceEndpoint &&
    (faceEndpoint.port ||
      !/^https:\/\/[a-z0-9-]+\.cognitiveservices\.azure\.com\/?$/i.test(
        settings.AZURE_FACE_ENDPOINT ?? "",
      ))
  )
    throw new Error(
      "AZURE_FACE_ENDPOINT must be an Azure Cognitive Services resource origin.",
    );

  const visionProvider =
    settings.VISION_AI_PROVIDER ??
    (settings.VISION_AI_BASE_URL?.replace(/\/$/, "") ===
    "https://api.openai.com"
      ? "openai"
      : "gemini");
  if (visionProvider !== "gemini" && visionProvider !== "openai")
    throw new Error("Invalid VISION_AI_PROVIDER.");
  const defaultVisionHost =
    visionProvider === "gemini"
      ? "generativelanguage.googleapis.com"
      : "api.openai.com";
  const visionEndpoint = httpsOrigin(
    settings.VISION_AI_BASE_URL || `https://${defaultVisionHost}`,
    "VISION_AI_BASE_URL",
  );
  const standardVisionHosts = [
    "generativelanguage.googleapis.com",
    "api.openai.com",
  ];
  if (
    (standardVisionHosts.includes(visionEndpoint.hostname) &&
      visionEndpoint.hostname !== defaultVisionHost) ||
    (visionEndpoint.origin !== `https://${defaultVisionHost}` &&
      settings.VISION_AI_ALLOW_CUSTOM_ORIGIN !== "true")
  )
    throw new Error(
      "VISION_AI_BASE_URL must use the selected provider's origin unless a custom origin is explicitly enabled.",
    );

  const visionModel =
    settings.VISION_AI_MODEL ||
    (visionProvider === "gemini" ? "gemini-2.5-flash" : "gpt-4o");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(visionModel))
    throw new Error("Invalid VISION_AI_MODEL.");

  return {
    mode: mode.data,
    providerMode: providerMode.data,
    host: settings.VERIFICATION_HOST || "127.0.0.1",
    port: numberSetting(
      settings.VERIFICATION_PORT,
      5176,
      "VERIFICATION_PORT",
      1,
      65535,
    ),
    workerEnabled: settings.VERIFICATION_WORKER_ENABLED !== "false",
    pollIntervalMs: numberSetting(
      settings.VERIFICATION_POLL_INTERVAL_MS,
      5000,
      "VERIFICATION_POLL_INTERVAL_MS",
      100,
      60000,
    ),
    maxAttempts: numberSetting(
      settings.VERIFICATION_MAX_ATTEMPTS,
      3,
      "VERIFICATION_MAX_ATTEMPTS",
      1,
      10,
    ),
    allowedOrigins: new Set([
      ...(
        settings.VERIFICATION_ALLOWED_ORIGINS ??
        settings.MEDIA_ALLOWED_ORIGINS ??
        "http://localhost:5173,http://127.0.0.1:5173"
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      "capacitor://localhost",
    ]),
    supabaseUrl: settings.SUPABASE_URL || undefined,
    supabasePublishableKey: settings.SUPABASE_PUBLISHABLE_KEY || undefined,
    supabaseSecretKey: settings.SUPABASE_SECRET_KEY || undefined,
    hmacPepper: settings.VERIFICATION_HMAC_PEPPER || undefined,
    azureFace:
      faceEndpoint && settings.AZURE_FACE_KEY
        ? { endpoint: faceEndpoint.origin, key: settings.AZURE_FACE_KEY }
        : undefined,
    visionAi: settings.VISION_AI_API_KEY
      ? ({
          endpoint: visionEndpoint.origin,
          key: settings.VISION_AI_API_KEY,
          model: visionModel,
          provider: visionProvider,
        } as const)
      : undefined,
  } as const;
}
export type VerificationConfig = ReturnType<typeof loadVerificationConfig>;
