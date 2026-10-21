import type { Experience } from "@/features/catalog/types";
export type MeetingPoint = {
  area: string;
  label: string;
  latitude: number;
  longitude: number;
};
export type LiveExperience = {
  experience: Experience;
  provider: { id: string; name: string };
  location: MeetingPoint;
  expiresAt: string;
};
export type LiveResults = { items: LiveExperience[]; serverTime: string };
export type ProviderPresence = {
  accepting: boolean;
  online: boolean;
  expiresAt: string | null;
};
export type ProviderListing = {
  id: string;
  title: string;
  published: boolean;
  meetingPoint: string;
  location: MeetingPoint | null;
};
export type ProviderDiscovery = {
  presence: ProviderPresence;
  packages: ProviderListing[];
};
