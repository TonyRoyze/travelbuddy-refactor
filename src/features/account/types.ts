import type { ProfileDetails } from "./profile-model";
export interface Account {
  id: string;
  displayName: string;
  email: string;
  roles: ("traveler" | "provider" | "guide" | "admin")[];
  onboarding: "pending" | "completed";
  revision: number;
  liveNow: boolean;
  avatarMediaId: string | null;
  profileVideoIds: string[];
  profileDetails: ProfileDetails;
}

export interface BuddyProfile {
  id: string;
  displayName: string;
  avatarMediaId: string | null;
  profileVideoIds: string[];
  profileDetails: Omit<ProfileDetails, "interests" | "travelStyle">;
  packages: import("@/features/catalog/types").Experience[];
}
