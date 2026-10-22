export const currencies = [
  "LKR",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "INR",
  "JPY",
  "SGD",
  "CNY",
  "AED",
  "CHF",
  "NZD",
] as const;
export type DisplayCurrency = (typeof currencies)[number];
export interface ExchangeRate {
  base: "LKR";
  quote: DisplayCurrency;
  date: string;
  rate: number;
}
export function validRates(raw: unknown, now = new Date()): ExchangeRate[] {
  if (!Array.isArray(raw)) throw new Error("Invalid exchange rate response.");
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const cutoff = new Date(Date.parse(day + "T00:00:00Z") - 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const seen = new Set<string>();
  return raw.filter((value): value is ExchangeRate => {
    if (!value || typeof value !== "object") return false;
    const r = value as ExchangeRate;
    if (
      r.base !== "LKR" ||
      !currencies.includes(r.quote) ||
      typeof r.rate !== "number" ||
      !Number.isFinite(r.rate) ||
      r.rate <= 0 ||
      typeof r.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      !Number.isFinite(Date.parse(r.date + "T00:00:00Z")) ||
      r.date > day ||
      r.date < cutoff ||
      seen.has(r.quote)
    )
      return false;
    seen.add(r.quote);
    return true;
  });
}
export function formatMoney(amount: number, currency = "LKR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(amount);
}
export function convertedAmount(
  amount: number,
  from: string,
  to: DisplayCurrency,
  rates: ExchangeRate[],
) {
  if (from === to) return amount;
  const source = from === "LKR" ? 1 : rates.find((r) => r.quote === from)?.rate;
  const target = to === "LKR" ? 1 : rates.find((r) => r.quote === to)?.rate;
  return source && target ? (amount / source) * target : null;
}
