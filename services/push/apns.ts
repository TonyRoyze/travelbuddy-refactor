import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";

export type PushJob = {
  id: string;
  leaseId: string;
  token: string;
  environment: "sandbox" | "production";
  recipientUserId: string;
  conversationId: string;
  messageId: string;
};
export type PushOutcome = "sent" | "retry" | "invalid" | "failed";
export function classifyApnsResponse(
  status: number,
  reason?: string,
): PushOutcome {
  if (status === 200) return "sent";
  if (
    status === 410 ||
    ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(
      reason ?? "",
    )
  )
    return "invalid";
  // Auth/configuration failures may be corrected before the next attempt.
  if (status === 429 || status >= 500 || status === 403) return "retry";
  return "failed";
}
export function createApnsSender(config: {
  teamId: string;
  keyId: string;
  privateKey: string;
  topic: string;
}) {
  const key = createPrivateKey(config.privateKey.replace(/\\n/g, "\n"));
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("APNs requires a P-256 signing key.");
  }
  let cached: { token: string; issuedAt: number } | undefined;
  const authorization = () => {
    const now = Math.floor(Date.now() / 1000);
    if (!cached || now - cached.issuedAt >= 3000) {
      const header = Buffer.from(
        JSON.stringify({ alg: "ES256", kid: config.keyId }),
      ).toString("base64url");
      const claims = Buffer.from(
        JSON.stringify({ iss: config.teamId, iat: now }),
      ).toString("base64url");
      const unsigned = `${header}.${claims}`;
      const signature = sign("sha256", Buffer.from(unsigned), {
        key,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url");
      cached = { token: `${unsigned}.${signature}`, issuedAt: now };
    }
    return cached.token;
  };
  return (job: PushJob): Promise<PushOutcome> =>
    new Promise((resolve) => {
      const client = connect(
        job.environment === "sandbox"
          ? "https://api.sandbox.push.apple.com"
          : "https://api.push.apple.com",
      );
      let finished = false;
      const finish = (outcome: PushOutcome) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        client.destroy();
        resolve(outcome);
      };
      const timeout = setTimeout(() => finish("retry"), 15000);
      client.on("error", () => finish("retry"));
      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${job.token}`,
        authorization: `bearer ${authorization()}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
        "apns-collapse-id": job.messageId,
      });
      let status = 0;
      let response = "";
      request.on("response", (headers) => {
        status = Number(headers[":status"]);
      });
      request.on("data", (chunk: Buffer) => {
        if (response.length < 8192) response += chunk.toString();
      });
      request.on("error", () => finish("retry"));
      request.on("end", () => {
        let reason: string | undefined;
        try {
          reason = (JSON.parse(response) as { reason?: string }).reason;
        } catch {
          /* Successful responses have no body. */
        }
        finish(classifyApnsResponse(status, reason));
      });
      // Keep message text and sender names off the lock screen and delivery queue.
      request.end(
        JSON.stringify({
          aps: {
            alert: { title: "TravelBuddy", body: "You have a new message." },
            sound: "default",
            "thread-id": job.conversationId,
          },
          conversationId: job.conversationId,
          recipientUserId: job.recipientUserId,
        }),
      );
    });
}
