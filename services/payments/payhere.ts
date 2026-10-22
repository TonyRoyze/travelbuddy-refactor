import { createHash, timingSafeEqual } from "node:crypto";
export const md5 = (value: string) =>
  createHash("md5").update(value).digest("hex").toUpperCase();
export function checkoutHash(
  merchant: string,
  order: string,
  amount: string,
  currency: string,
  secret: string,
) {
  return md5(merchant + order + amount + currency + md5(secret));
}
export function verifyNotification(
  fields: Record<string, string>,
  merchant: string,
  secret: string,
) {
  if (
    fields.merchant_id !== merchant ||
    !/^[0-9A-Fa-f]{32}$/.test(fields.md5sig ?? "") ||
    !/^\d+\.\d{2}$/.test(fields.payhere_amount ?? "") ||
    !["USD", "LKR"].includes(fields.payhere_currency) ||
    !["2", "0", "-1", "-2", "-3"].includes(fields.status_code) ||
    !fields.payment_id ||
    !fields.order_id
  )
    return false;
  const expected = md5(
    fields.merchant_id +
      fields.order_id +
      fields.payhere_amount +
      fields.payhere_currency +
      fields.status_code +
      md5(secret),
  );
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(fields.md5sig.toUpperCase()),
  );
}
