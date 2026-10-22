import { z } from "zod";
import { defaultSchedule, scheduleSchema } from "./schedule-model";

export const MAX_CLIP_BYTES = 25 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 60;
export const mediaUrl = (id: string) => `/api/media/${id}`;
const line = z.string().trim().max(240);
export const packageEditorSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    schedule: scheduleSchema.optional(),
    destination: z.string().trim().max(120),
    country: z.string().trim().max(120),
    category: z.string().trim().max(80),
    description: z.string().trim().max(5000),
    durationMinutes: z.number().int().min(15).max(10080),
    languages: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
    imageIds: z.array(z.string().min(1).max(2048)).max(6),
    videoIds: z.array(z.string().uuid()).max(3),
    highlights: z.array(line).max(12),
    included: z.array(line).max(20),
    notIncluded: z.array(line).max(20),
    meetingPoint: z.string().trim().max(500),
    freeCancellation: z.boolean(),
    payLater: z.boolean().default(false),
    pickup: z.boolean(),
    options: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            price: z.number().finite().min(0).max(10000000),
            capacity: z.number().int().min(1).max(12),
            times: z
              .array(
                z
                  .string()
                  .trim()
                  .regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              )
              .min(1)
              .max(24),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    itinerary: z
      .array(
        z
          .object({
            time: z.string().trim().max(60),
            title: z.string().trim().min(1).max(160),
            detail: z.string().trim().max(1000),
          })
          .strict(),
      )
      .max(20),
    published: z.boolean(),
    revision: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.published) return;
    for (const field of [
      "destination",
      "country",
      "category",
      "meetingPoint",
    ] as const) {
      if (!value[field])
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Complete this field before publishing.",
        });
    }
    if (value.description.length < 20)
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "Describe your experience in at least 20 characters.",
      });
    if (!value.imageIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["imageIds"],
        message: "Add a cover photo before publishing.",
      });
  });
export type PackageEditorData = z.infer<typeof packageEditorSchema>;
export type EditorPackage = {
  id: string;
  revision: number;
  updatedAt: string;
  input: PackageEditorData;
};
export function emptyPackage(): PackageEditorData {
  return {
    title: "",
    schedule: defaultSchedule(),
    destination: "",
    country: "Sri Lanka",
    category: "Tours & sightseeing",
    description: "",
    durationMinutes: 120,
    languages: ["English"],
    imageIds: [],
    videoIds: [],
    highlights: [],
    included: [],
    notIncluded: [],
    meetingPoint: "",
    freeCancellation: true,
    payLater: false,
    pickup: false,
    options: [
      {
        name: "Small group experience",
        price: 7500,
        capacity: 6,
        times: ["09:00"],
      },
    ],
    itinerary: [],
    published: false,
  };
}
