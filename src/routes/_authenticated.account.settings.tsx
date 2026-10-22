import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProfileSettingsPage } from "@/features/account/profile-settings";
import { accountQuery } from "@/lib/queries";
export const Route = createFileRoute("/_authenticated/account/settings")({
  beforeLoad: async ({ context }) => {
    const account = await context.queryClient.fetchQuery(accountQuery());
    if (account.roles.some((role) => ["provider", "guide"].includes(role)))
      throw redirect({ to: "/account/profile" });
  },
  component: ProfileSettingsPage,
});
