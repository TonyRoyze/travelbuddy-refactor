import { describe, expect, it, vi } from "vitest";
import { idFront, policy } from "../fixtures.test-support";
import { extractionSchemas, VisionAiClient } from "./vision-ai";

const key = "fixture";
const gemini = {
  endpoint: "https://generativelanguage.googleapis.com",
  key,
  model: "gemini-2.5-flash",
  provider: "gemini",
} as const;
const openai = {
  endpoint: "https://api.openai.com",
  key,
  model: "gpt-4o",
  provider: "openai",
} as const;

describe("VisionAiClient", () => {
  it("requests Gemini structured extraction with image bytes and header authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                { text: "ignored reasoning", thought: true },
                { text: JSON.stringify(idFront) },
              ],
            },
          },
        ],
      }),
    );
    expect(
      await new VisionAiClient(gemini, fetcher).extractDocument(
        "id-front",
        "AA==",
      ),
    ).toEqual(idFront);
    const [url, request] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      `${gemini.endpoint}/v1beta/models/gemini-2.5-flash:generateContent`,
    );
    expect(new Headers(request?.headers).get("x-goog-api-key")).toBe(key);
    expect(request?.redirect).toBe("error");
    const body = JSON.parse(String(request?.body));
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: "image/jpeg", data: "AA==" },
    });
    expect(
      body.generationConfig.responseJsonSchema.properties.fields
        .additionalProperties,
    ).toBe(false);
  });

  it("requests an OpenAI strict schema with storage disabled and retries a 5xx", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: JSON.stringify(policy) } }],
        }),
      );
    expect(
      await new VisionAiClient(openai, fetcher).extractDocument(
        "insurance",
        "AA==",
      ),
    ).toEqual(policy);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, request] = fetcher.mock.calls[1];
    expect(String(url)).toBe(`${openai.endpoint}/v1/chat/completions`);
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      `Bearer ${key}`,
    );
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: "gpt-4o",
      store: false,
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
  });

  it("rejects invalid extraction without leaking the response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...idFront,
                fields: { ...idFront.fields, unexpected: "private data" },
              }),
            },
          },
        ],
      }),
    );
    await expect(
      new VisionAiClient(openai, fetcher).extractDocument("id-front", "AA=="),
    ).rejects.toThrow("Verification provider request failed.");
    expect(extractionSchemas.insurance.safeParse(idFront).success).toBe(false);
  });
});
