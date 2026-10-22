import { z } from "zod";
import { currencies } from "@/features/currency/model";
export const profileDetailsSchema = z.object({
  displayCurrency: z.enum(currencies).default("LKR"),
  bio: z.string().trim().max(500),
  homeBase: z.string().trim().max(120),
  languages: z.string().trim().max(160),
  interests: z.string().trim().max(240),
  travelStyle: z.string().trim().max(120),
  specialties: z.string().trim().max(240),
  yearsExperience: z.number().int().min(0).max(80).nullable(),
});
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  profileDetails: profileDetailsSchema,
});
export const profileSignature = (account: {
  displayName: string;
  profileDetails: ProfileDetails;
}) =>
  JSON.stringify({
    displayName: account.displayName,
    profileDetails: account.profileDetails,
  });
export function validateProfileFile(
  file: Pick<File, "type" | "size">,
  kind: "photo" | "video",
) {
  const allowed =
    kind === "photo"
      ? ["image/jpeg", "image/png", "image/webp"]
      : ["video/mp4", "video/webm"];
  if (!allowed.includes(file.type))
    return kind === "photo"
      ? "Choose a JPEG, PNG or WebP photo."
      : "Choose an MP4 or WebM video.";
  if (!file.size || file.size > (kind === "photo" ? 5 : 25) * 1024 * 1024)
    return kind === "photo"
      ? "Choose a non-empty photo up to 5 MB."
      : "Choose a non-empty video up to 25 MB.";
  return "";
}
