import { createFileRoute } from "@tanstack/react-router";
import { ProviderDashboardPage } from "@/features/account/provider-dashboard";
export const Route = createFileRoute("/_authenticated/account/dashboard")({
  component: ProviderDashboardPage,
});
