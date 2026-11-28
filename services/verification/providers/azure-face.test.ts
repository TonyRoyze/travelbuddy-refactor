import { describe, expect, it, vi } from "vitest";
import { accountId, date, sessionId } from "../fixtures.test-support";
import { AzureFaceClient } from "./azure-face";
import {
  signSessionReference,
  verifySessionReference,
} from "./session-reference";

const endpoint = "https://fixture.cognitiveservices.azure.com";
const key = "fixture";

describe("AzureFaceClient", () => {
  it("requests a short-lived liveness session with a correlation ID", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ sessionId, authToken: "fixture-token" }),
      );
    expect(
      await new AzureFaceClient(
        { endpoint, key },
        fetcher,
      ).createLivenessSession(accountId),
    ).toEqual({ sessionId, authToken: "fixture-token", expiresInSeconds: 300 });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`${endpoint}/face/v1.2/detectLiveness-sessions`);
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      deviceCorrelationId: accountId,
      enableSessionImage: true,
      authTokenTimeToLiveInSeconds: 300,
    });
  });

  it("reads the highest attempt ID even when results are reverse ordered", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        sessionId,
        status: "Succeeded",
        results: {
          attempts: [
            {
              attemptId: 2,
              attemptStatus: "Succeeded",
              result: { livenessDecision: "spoofface" },
            },
            {
              attemptId: 1,
              attemptStatus: "Succeeded",
              result: {
                livenessDecision: "realface",
                sessionImageId: "frame-id",
              },
            },
          ],
        },
      }),
    );
    expect(
      await new AzureFaceClient({ endpoint, key }, fetcher).getLivenessResult(
        sessionId,
      ),
    ).toEqual({ status: "spoof" });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${endpoint}/face/v1.2/detectLiveness-sessions/${sessionId}`,
    );
  });

  it("detects exactly one face per image and verifies temporary face IDs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ faceId: accountId }]))
      .mockResolvedValueOnce(Response.json([{ faceId: sessionId }]))
      .mockResolvedValueOnce(
        Response.json({ confidence: 0.91, isIdentical: true }),
      );
    const client = new AzureFaceClient({ endpoint, key }, fetcher);
    const image = Buffer.from([0]);
    expect(await client.verifyFace(image, image)).toBe(0.91);
    const detection = new URL(String(fetcher.mock.calls[0][0]));
    expect(Object.fromEntries(detection.searchParams)).toMatchObject({
      detectionModel: "detection_03",
      recognitionModel: "recognition_04",
      returnFaceId: "true",
      faceIdTimeToLive: "60",
    });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
      faceId1: accountId,
      faceId2: sessionId,
    });
    fetcher
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ faceId: sessionId }]));
    expect(await client.verifyFace(image, image)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("retries a network error and throttling, and stops immediately on unauthorized", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("sensitive body"))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({ sessionId, authToken: "fixture-token" }),
      );
    const client = new AzureFaceClient({ endpoint, key }, fetcher);
    await expect(
      client.createLivenessSession(accountId),
    ).resolves.toHaveProperty("sessionId", sessionId);
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockResolvedValueOnce(
      new Response("sensitive body", { status: 401 }),
    );
    await expect(client.createLivenessSession(accountId)).rejects.toThrow(
      "Verification provider request failed.",
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe("liveness session references", () => {
  it("binds a live session to the authenticated account and submission window", () => {
    const reference = signSessionReference(
      sessionId,
      accountId,
      key,
      date.getTime(),
    );
    expect(reference.length).toBeLessThan(128);
    expect(
      verifySessionReference(reference, accountId, date.toISOString(), key),
    ).toBe(sessionId);
    expect(
      verifySessionReference(reference, sessionId, date.toISOString(), key),
    ).toBeNull();
    expect(
      verifySessionReference(
        reference + "x",
        accountId,
        date.toISOString(),
        key,
      ),
    ).toBeNull();
    expect(
      verifySessionReference(sessionId, accountId, date.toISOString(), key),
    ).toBeNull();
    expect(
      verifySessionReference(
        reference,
        accountId,
        new Date(date.getTime() + 16 * 60_000).toISOString(),
        key,
      ),
    ).toBeNull();
  });
});
