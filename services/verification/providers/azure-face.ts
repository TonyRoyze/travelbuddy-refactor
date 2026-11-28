import { z } from "zod";
import { ProviderRequestError, readJson, requestProvider } from "./http";
import type { LivenessResult } from "./interface";

const ttl = 300;
const livenessPath = "detectLiveness-sessions";
const sessionSchema = z.object({
  sessionId: z.uuid(),
  authToken: z.string().min(1),
});
const resultSchema = z.object({
  sessionId: z.uuid(),
  status: z.enum(["NotStarted", "Running", "Succeeded", "Failed", "Canceled"]),
  results: z
    .object({
      attempts: z.array(
        z.object({
          attemptId: z.number().int(),
          attemptStatus: z.enum([
            "NotStarted",
            "Running",
            "Succeeded",
            "Failed",
            "Canceled",
          ]),
          result: z
            .object({
              livenessDecision: z.enum(["realface", "spoofface", "uncertain"]),
              sessionImageId: z
                .string()
                .regex(/^[\w-]{1,256}$/)
                .nullish(),
            })
            .nullish(),
        }),
      ),
    })
    .nullish(),
});
const facesSchema = z.array(z.object({ faceId: z.uuid() }));
const verificationSchema = z.object({
  confidence: z.number().min(0).max(1),
  isIdentical: z.boolean(),
});

export class AzureFaceClient {
  constructor(
    private readonly config: { endpoint: string; key: string },
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private request<T>(
    path: string,
    init: RequestInit,
    read: (response: Response) => Promise<T>,
    signal?: AbortSignal,
  ) {
    return requestProvider(
      this.fetcher,
      new URL(`/face/v1.2/${path}`, this.config.endpoint),
      {
        ...init,
        headers: {
          "Ocp-Apim-Subscription-Key": this.config.key,
          ...init.headers,
        },
      },
      read,
      signal,
    );
  }

  async createLivenessSession(accountId: string) {
    const session = sessionSchema.safeParse(
      await this.request(
        livenessPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            livenessOperationMode: "PassiveActive",
            authTokenTimeToLiveInSeconds: ttl,
            deviceCorrelationId: accountId,
            // Compare this frame against the uploaded selfie to bind the liveness check to it.
            enableSessionImage: true,
          }),
        },
        readJson,
      ),
    );
    if (!session.success) throw new ProviderRequestError();
    return { ...session.data, expiresInSeconds: ttl };
  }

  async getLivenessResult(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<LivenessResult> {
    if (!z.uuid().safeParse(sessionId).success)
      return { status: "unavailable" };
    try {
      const result = resultSchema.safeParse(
        await this.request(
          `${livenessPath}/${sessionId}`,
          {},
          readJson,
          signal,
        ),
      );
      if (
        !result.success ||
        result.data.sessionId.toLowerCase() !== sessionId.toLowerCase()
      )
        return { status: "unavailable" };
      const latest = result.data.results?.attempts.reduce<
        NonNullable<typeof result.data.results>["attempts"][number] | undefined
      >(
        (newest, attempt) =>
          !newest || attempt.attemptId > newest.attemptId ? attempt : newest,
        undefined,
      );
      if (latest?.attemptStatus === "Succeeded") {
        if (latest.result?.livenessDecision === "realface")
          return {
            status: "passed",
            sessionImageId: latest.result.sessionImageId ?? undefined,
          };
        if (latest.result?.livenessDecision === "spoofface")
          return { status: "spoof" };
        if (latest.result?.livenessDecision === "uncertain")
          return { status: "failed" };
        return { status: "unavailable" };
      }
      if (
        ["Failed", "Canceled"].includes(
          latest?.attemptStatus ?? result.data.status,
        )
      )
        return { status: "failed" };
      return { status: "pending" };
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 404)
        return { status: "unavailable" };
      throw error;
    }
  }

  async getLivenessImage(
    sessionImageId: string,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    if (!/^[\w-]{1,256}$/.test(sessionImageId)) return null;
    return this.request(
      `sessionImages/${sessionImageId}`,
      {},
      async (response) => {
        const image = Buffer.from(await response.arrayBuffer());
        return image.length > 0 && image.length <= 6 * 1024 * 1024
          ? image
          : null;
      },
      signal,
    );
  }

  async deleteLivenessSession(sessionId: string) {
    if (!z.uuid().safeParse(sessionId).success) return;
    try {
      await this.request(
        `${livenessPath}/${sessionId}`,
        { method: "DELETE" },
        async () => undefined,
      );
    } catch (error) {
      if (!(error instanceof ProviderRequestError && error.status === 404))
        throw error;
    }
  }

  async verifyFace(
    selfieJpeg: Buffer,
    targetJpeg: Buffer,
    signal?: AbortSignal,
  ): Promise<number | null> {
    const detect = async (jpeg: Buffer) => {
      const result = facesSchema.safeParse(
        await this.request(
          "detect?_overload=detect&detectionModel=detection_03&recognitionModel=recognition_04&returnFaceId=true&faceIdTimeToLive=60",
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: new Uint8Array(jpeg),
          },
          readJson,
          signal,
        ),
      );
      if (!result.success) throw new ProviderRequestError();
      return result.data.length === 1 ? result.data[0].faceId : null;
    };

    const [faceId1, faceId2] = await Promise.all([
      detect(selfieJpeg),
      detect(targetJpeg),
    ]);
    if (!faceId1 || !faceId2) return null;
    const result = verificationSchema.safeParse(
      await this.request(
        "verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faceId1, faceId2 }),
        },
        readJson,
        signal,
      ),
    );
    if (!result.success) throw new ProviderRequestError();
    return result.data.confidence;
  }
}
