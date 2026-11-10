import { generateKeyPairSync, verify } from "node:crypto";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("node:http2", () => ({ connect: mocks.connect }));
import { classifyApnsResponse, createApnsSender, type PushJob } from "./apns";
const job: PushJob = {
  id: "job",
  leaseId: "lease",
  token: "ab".repeat(32),
  environment: "sandbox",
  conversationId: "conversation",
  messageId: "message",
  recipientUserId: "recipient",
};
beforeEach(() => vi.clearAllMocks());
describe("APNs delivery", () => {
  it.each([
    [200, undefined, "sent"],
    [410, "Unregistered", "invalid"],
    [400, "BadDeviceToken", "invalid"],
    [400, "DeviceTokenNotForTopic", "invalid"],
    [403, "ExpiredProviderToken", "retry"],
    [429, undefined, "retry"],
    [503, undefined, "retry"],
    [400, "BadPayload", "failed"],
  ] as const)("classifies %s / %s as %s", (status, reason, expected) => {
    expect(classifyApnsResponse(status, reason)).toBe(expected);
  });
  it("sends a signed ES256 alert to the correct Apple environment without message contents", async () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const request = Object.assign(new EventEmitter(), { end: vi.fn() });
    const client = Object.assign(new EventEmitter(), {
      request: vi.fn((headers: Record<string, string>) => {
        expect(headers).toBeDefined();
        return request;
      }),
      destroy: vi.fn(),
    });
    mocks.connect.mockReturnValue(client);
    const send = createApnsSender({
      teamId: "team",
      keyId: "key",
      topic: "com.travelbuddy.app",
      privateKey: keys.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
    });
    const sent = send(job);
    expect(mocks.connect).toHaveBeenCalledWith(
      "https://api.sandbox.push.apple.com",
    );
    const headers = client.request.mock.calls[0]![0] as unknown as Record<
      string,
      string
    >;
    const jwt = headers.authorization.replace("bearer ", "");
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "key",
    });
    expect(
      JSON.parse(Buffer.from(claims, "base64url").toString()),
    ).toMatchObject({ iss: "team" });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: keys.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-topic"]).toBe("com.travelbuddy.app");
    expect(JSON.parse(request.end.mock.calls[0][0])).toMatchObject({
      aps: { alert: { body: "You have a new message." }, sound: "default" },
      conversationId: "conversation",
      recipientUserId: "recipient",
    });
    request.emit("response", { ":status": 200 });
    request.emit("end");
    expect(await sent).toBe("sent");
    expect(client.destroy).toHaveBeenCalledOnce();
    const production = send({ ...job, environment: "production" });
    expect(mocks.connect).toHaveBeenLastCalledWith(
      "https://api.push.apple.com",
    );
    client.emit("error", new Error("network failure"));
    expect(await production).toBe("retry");
  });
});
