import { createFileRoute } from "@tanstack/react-router";
import { BuddyPackageEditor } from "@/features/packages/package-editor";
export const Route = createFileRoute("/_authenticated/account/packages/new")({
  component: () => <BuddyPackageEditor />,
});
