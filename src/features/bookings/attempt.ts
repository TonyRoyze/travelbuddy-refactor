import { z } from "zod";
const schema = z.object({
  key: z.uuid(),
  item: z.uuid(),
  fingerprint: z.string().optional(),
});
export type CheckoutAttempt = z.infer<typeof schema>;
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readAttempt(
  key: string,
  storage: AttemptStorage,
): CheckoutAttempt {
  try {
    const value = schema.safeParse(JSON.parse(storage.getItem(key) ?? "null"));
    if (value.success) return value.data;
  } catch {
    /* Invalid/stale local state starts a new attempt. */
  }
  return { key: crypto.randomUUID(), item: crypto.randomUUID() };
}
export function saveAttempt(
  key: string,
  attempt: CheckoutAttempt,
  fingerprint: string,
  storage: AttemptStorage,
) {
  const next = {
    ...attempt,
    key:
      attempt.fingerprint && attempt.fingerprint !== fingerprint
        ? crypto.randomUUID()
        : attempt.key,
    fingerprint,
  };
  storage.setItem(key, JSON.stringify(next));
  return next;
}
