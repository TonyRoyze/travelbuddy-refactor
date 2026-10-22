import { z } from "zod";
import type { LiveExperience } from "./types";
export const nearbySearchSchema = z.object({
  area: z.string().trim().max(120).catch(""),
  view: z.enum(["map", "list"]).catch("map"),
  selected: z.string().max(80).optional().catch(undefined),
});
export type NearbySearch = z.infer<typeof nearbySearchSchema>;
export const meetingPointSchema = z.object({
  packageId: z.string().min(1).max(80),
  area: z.string().trim().min(2).max(120),
  label: z.string().trim().min(2).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export function activeExperiences(
  items: LiveExperience[],
  serverTime: string,
  receivedAt: number,
  now = Date.now(),
) {
  const serverNow = Date.parse(serverTime) + Math.max(0, now - receivedAt);
  return items.filter((item) => Date.parse(item.expiresAt) > serverNow);
}
export function groupPoints(items: LiveExperience[]) {
  const groups = new Map<string, LiveExperience[]>();
  for (const item of items) {
    const key = `${item.location.latitude},${item.location.longitude}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}
