import { createFileRoute } from "@tanstack/react-router";
import { AccountSecurityPage } from "@/features/account/account-security";
export const Route = createFileRoute("/_authenticated/account/security")({
  component: AccountSecurityPage,
});
