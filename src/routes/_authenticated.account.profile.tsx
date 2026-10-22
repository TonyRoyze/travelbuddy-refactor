import { createFileRoute } from "@tanstack/react-router";
import { ProfileSettingsPage } from "@/features/account/profile-settings";
import { BuddyGate } from "@/features/packages/buddy-gate";
export const Route = createFileRoute("/_authenticated/account/profile")({
  component: () => (
    <BuddyGate>
      <ProfileSettingsPage />
    </BuddyGate>
  ),
});
