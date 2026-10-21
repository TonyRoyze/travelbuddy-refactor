import { z } from "zod";
import { date, today } from "@/lib/validation";
export function addDays(value: string, days: number) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const dateSchema = date;
export const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((values) => new Set(values).size === values.length),
    exceptions: z
      .array(
        z
          .object({
            date: dateSchema,
            closed: z.boolean(),
            capacity: z.number().int().min(1).max(12).optional(),
            times: z.array(timeSchema).min(1).max(24).optional(),
          })
          .strict(),
      )
      .max(366)
      .refine(
        (values) =>
          new Set(values.map((value) => value.date)).size === values.length,
        "Use one exception per date.",
      ),
  })
  .strict()
  .refine(
    (value) =>
      value.endDate >= value.startDate &&
      value.endDate <= addDays(value.startDate, 730),
    "The end date must be after the start date and within two years.",
  );
export type PackageSchedule = z.infer<typeof scheduleSchema>;
export function defaultSchedule(): PackageSchedule {
  return {
    startDate: today(),
    endDate: addDays(today(), 180),
    weekdays: [1, 2, 3, 4, 5, 6],
    exceptions: [],
  };
}
export function readSchedule(raw: unknown) {
  return raw && typeof raw === "object" && Object.keys(raw).length
    ? scheduleSchema.parse(raw)
    : defaultSchedule();
}
