import { createHmac } from "node:crypto";

export function normalizeNic(input: string | null | undefined): string | null {
  const value = input?.replace(/[\s-]/g, "").toUpperCase() ?? "";
  if (/^\d{12}$/.test(value)) return value;
  if (/^\d{9}[VX]$/.test(value))
    return `19${value.slice(0, 5)}0${value.slice(5, 9)}`;
  return null;
}

export function decodeNic(input: string | null | undefined) {
  const normalized = normalizeNic(input);
  if (!normalized) return null;
  const year = Number(normalized.slice(0, 4));
  const dayCode = Number(normalized.slice(4, 7));
  const female = dayCode >= 501;
  const day = female ? dayCode - 500 : dayCode;
  if (year < 1900 || day < 1 || day > 366) return null;
  // Map using a leap year so day 61 is always March 1.
  const monthDay = new Date(Date.UTC(2000, 0, day)).toISOString().slice(5, 10);
  const birthDate = `${year}-${monthDay}`;
  if (!isCalendarDate(birthDate)) return null;
  return { normalized, birthDate, gender: female ? "female" : "male" } as const;
}

const colomboDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatColomboDate(date = new Date()): string {
  const parts = Object.fromEntries(
    colomboDate.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

export function isAtLeast18Colombo(
  birthDate: string,
  now = new Date(),
): boolean {
  if (!isCalendarDate(birthDate)) return false;
  const today = formatColomboDate(now);
  const eighteenthBirthday = `${Number(birthDate.slice(0, 4)) + 18}${birthDate.slice(4)}`;
  return today >= eighteenthBirthday;
}

export function daysUntilColomboDate(
  date: string,
  now = new Date(),
): number | null {
  if (!isCalendarDate(date)) return null;
  return (Date.parse(date) - Date.parse(formatColomboDate(now))) / 86400000;
}

export function hmacCredential(
  value: string | null | undefined,
  pepper: string | undefined,
): string | undefined {
  return value && pepper
    ? createHmac("sha256", pepper).update(value).digest("hex")
    : undefined;
}
