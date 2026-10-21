import { createFileRoute } from "@tanstack/react-router";
import { BuddyPackagesPage } from "@/features/packages/package-list";
export const Route = createFileRoute("/_authenticated/account/packages/")({
  component: BuddyPackagesPage,
});
