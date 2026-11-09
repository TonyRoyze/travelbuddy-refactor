import { describe, expect, it } from "vitest";
import { readUploadResult } from "./upload-result";
const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("profile upload confirmation", () => {
  it("accepts a committed upload ID", async () => {
    await expect(
      readUploadResult(Response.json({ mediaId }, { status: 201 })),
    ).resolves.toBe(mediaId);
  });
  it("rejects an SPA fallback that returns HTML with HTTP 200", async () => {
    await expect(
      readUploadResult(new Response("<!doctype html><html></html>")),
    ).rejects.toThrow("not saved");
  });
  it("rejects missing or invalid IDs even on successful HTTP responses", async () => {
    for (const body of [
      { ready: true },
      { mediaId: "" },
      { mediaId: "invalid" },
      null,
    ]) {
      await expect(readUploadResult(Response.json(body))).rejects.toThrow(
        "not saved",
      );
    }
  });
  it("reports a storage outage without treating an ID on an error response as success", async () => {
    await expect(
      readUploadResult(
        Response.json(
          { error: "Storage unavailable", mediaId },
          { status: 503 },
        ),
      ),
    ).rejects.toThrow("Storage unavailable");
  });
});
