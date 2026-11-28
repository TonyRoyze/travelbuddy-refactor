import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVerificationConfig } from "./config";

describe("loadVerificationConfig", () => {
  it("runs without provider keys or a credential pepper", () => {
    expect(loadVerificationConfig({})).toMatchObject({
      mode: "auto",
      providerMode: "option_a_inhouse",
      host: "127.0.0.1",
      port: 5176,
      hmacPepper: undefined,
      azureFace: undefined,
      visionAi: undefined,
    });
  });

  it("accepts the configured modes and provider defaults", () => {
    const config = loadVerificationConfig({
      VERIFICATION_MODE: "assisted",
      VERIFICATION_PROVIDER_MODE: "option_b_hybrid",
      VERIFICATION_WORKER_ENABLED: "false",
      VERIFICATION_HMAC_PEPPER: "fixture",
      AZURE_FACE_ENDPOINT: "https://resource-123.cognitiveservices.azure.com/",
      AZURE_FACE_KEY: "fixture",
      VISION_AI_PROVIDER: "openai",
      VISION_AI_API_KEY: "fixture",
    });
    expect(config).toMatchObject({
      mode: "assisted",
      providerMode: "option_b_hybrid",
      workerEnabled: false,
      hmacPepper: "fixture",
      azureFace: {
        endpoint: "https://resource-123.cognitiveservices.azure.com",
      },
      visionAi: {
        provider: "openai",
        model: "gpt-4o",
        endpoint: "https://api.openai.com",
      },
    });
  });

  it.each([
    "http://resource.cognitiveservices.azure.com",
    "https://resource.cognitiveservices.azure.com:443",
    "https://resource.cognitiveservices.azure.com/face",
    "https://resource.cognitiveservices.azure.com?",
    "https://resource.cognitiveservices.azure.com/#",
    "https://resource.cognitiveservices.azure.com.evil.test",
    "https://user@resource.cognitiveservices.azure.com",
  ])("rejects an unauthorized Azure endpoint %s", (endpoint) => {
    expect(() =>
      loadVerificationConfig({ AZURE_FACE_ENDPOINT: endpoint }),
    ).toThrow("AZURE_FACE_ENDPOINT");
  });

  it("requires explicit trust for a custom Vision HTTPS origin", () => {
    expect(() =>
      loadVerificationConfig({ VISION_AI_BASE_URL: "https://proxy.example" }),
    ).toThrow("VISION_AI_BASE_URL");
    expect(
      loadVerificationConfig({
        VISION_AI_BASE_URL: "https://proxy.example:8443",
        VISION_AI_ALLOW_CUSTOM_ORIGIN: "true",
        VISION_AI_API_KEY: "fixture",
      }).visionAi?.endpoint,
    ).toBe("https://proxy.example:8443");
    for (const url of [
      "http://proxy.example",
      "https://proxy.example/../",
      "https://key@proxy.example",
      "https://proxy.example/?",
      "https://proxy.example/#",
    ]) {
      expect(() =>
        loadVerificationConfig({
          VISION_AI_BASE_URL: url,
          VISION_AI_ALLOW_CUSTOM_ORIGIN: "true",
        }),
      ).toThrow("VISION_AI_BASE_URL");
    }
  });

  it("rejects invalid mode settings", () => {
    expect(() =>
      loadVerificationConfig({ VERIFICATION_MODE: "full-auto" }),
    ).toThrow("VERIFICATION_MODE");
    expect(() =>
      loadVerificationConfig({ VERIFICATION_PROVIDER_MODE: "hybrid" }),
    ).toThrow("VERIFICATION_PROVIDER_MODE");
    expect(() =>
      loadVerificationConfig({ VISION_AI_PROVIDER: "other" }),
    ).toThrow("VISION_AI_PROVIDER");
  });

  it("ignores blank entries in .env.verification.local so .env.media.local values survive", () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-verif-env-"));
    const prevCwd = process.cwd();
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SECRET_KEY;
    try {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SECRET_KEY;
      writeFileSync(
        join(dir, ".env.media.local"),
        "SUPABASE_URL=https://media.example.supabase.co\nSUPABASE_SECRET_KEY=media-secret\n",
      );
      writeFileSync(
        join(dir, ".env.verification.local"),
        "SUPABASE_URL=\nSUPABASE_SECRET_KEY=\nVERIFICATION_MODE=assisted\n",
      );
      process.chdir(dir);
      const loaded = loadVerificationConfig();
      expect(loaded.supabaseUrl).toBe("https://media.example.supabase.co");
      expect(loaded.supabaseSecretKey).toBe("media-secret");
      expect(loaded.mode).toBe("assisted");
    } finally {
      process.chdir(prevCwd);
      if (prevUrl !== undefined) process.env.SUPABASE_URL = prevUrl;
      if (prevKey !== undefined) process.env.SUPABASE_SECRET_KEY = prevKey;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
