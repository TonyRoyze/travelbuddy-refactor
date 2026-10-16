import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/auth-page";
import { safeReturn } from "@/lib/validation";
export const Route = createFileRoute("/forgot-password")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) => ({
    returnTo: safeReturn(input.returnTo),
  }),
  component: Page,
});
function Page() {
  return <AuthPage mode="recover" returnTo={Route.useSearch().returnTo} />;
}
