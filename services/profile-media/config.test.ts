import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUploadProject } from "./config";

afterEach(() => vi.unstubAllGlobals());

describe("upload Supabase configuration", () => {
  it("identifies an unreachable upload instance without asking the user to sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await expect(
      checkUploadProject(
        { url: "https://remote.example", key: "remote-public-key" },
        { url: "http://localhost:8000", key: "local-public-key" },
      ),
    ).rejects.toThrow("The upload service cannot reach http://localhost:8000");
  });
  it("detects a remote browser paired with an unrelated local instance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(
      checkUploadProject(
        { url: "https://remote.example", key: "remote-public-key" },
        { url: "http://localhost:8000", key: "local-public-key" },
      ),
    ).rejects.toThrow("Configure .env.media.local");
  });

  it("allows separate public and internal URLs when the gateway accepts the browser key", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", request);
    await expect(
      checkUploadProject(
        { url: "https://remote.example", key: "browser-public-key" },
        { url: "http://internal:8000", key: "another-valid-public-key" },
      ),
    ).resolves.toBeUndefined();
    expect(request.mock.calls[0][1].headers.apikey).toBe("browser-public-key");
  });
});
