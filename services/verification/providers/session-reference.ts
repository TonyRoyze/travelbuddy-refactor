import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function tag(
  sessionId: string,
  accountId: string,
  issuedAt: string,
  key: string,
) {
  return createHmac("sha256", key)
    .update(
      `travelbuddy:azure-face:liveness:v1:${accountId}:${sessionId}:${issuedAt}`,
    )
    .digest("base64url");
}

export function signSessionReference(
  sessionId: string,
  accountId: string,
  key: string,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000).toString(36);
  return `${sessionId}.${issuedAt}.${tag(sessionId, accountId, issuedAt, key)}`;
}

export function verifySessionReference(
  reference: string,
  accountId: string,
  submittedAt: string,
  key: string,
) {
  const [sessionId, issuedAt, signature, extra] = reference.split(".");
  if (
    extra !== undefined ||
    !z.uuid().safeParse(sessionId).success ||
    !/^[a-z0-9]{1,10}$/.test(issuedAt ?? "") ||
    !/^[\w-]{43}$/.test(signature ?? "")
  )
    return null;
  const age = Date.parse(submittedAt) - Number.parseInt(issuedAt, 36) * 1000;
  // Reference freshness is evaluated at submission, since jobs can wait in the queue.
  if (!Number.isFinite(age) || age < -30_000 || age > 15 * 60_000) return null;
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(tag(sessionId, accountId, issuedAt, key)),
  )
    ? sessionId
    : null;
}
