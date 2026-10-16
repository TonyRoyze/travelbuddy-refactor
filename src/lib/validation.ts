import { z } from "zod";
export const safeReturn = (value: unknown): string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !/[\\\r\n]/.test(value) &&
  !value.startsWith("/auth/") &&
  !value.startsWith("/login")
    ? value
    : "/";
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v + "T00:00:00Z")) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
  );
export const selectionSchema = z.object({
  date: date.optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  option: z.coerce.number().int().min(0).max(7).catch(0),
  travelers: z.coerce.number().int().min(1).max(12).catch(1),
});
export type Selection = z.infer<typeof selectionSchema>;
export const searchSchema = z.object({
  q: z.string().trim().max(120).catch(""),
  category: z.string().max(80).catch(""),
  destination: z.string().max(120).catch(""),
  minPrice: z.coerce.number().min(0).optional().catch(undefined),
  maxPrice: z.coerce.number().min(0).optional().catch(undefined),
  freeCancellation: z.coerce.boolean().catch(false),
  sort: z.enum(["recommended", "price-low", "rating"]).catch("recommended"),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
export const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);

export type SearchFilters = z.infer<typeof searchSchema>;
