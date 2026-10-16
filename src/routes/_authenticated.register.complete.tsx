import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/features/account/account-page";
import { safeReturn } from "@/lib/validation";
export const Route = createFileRoute("/_authenticated/register/complete")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) => ({
    returnTo: safeReturn(input.returnTo),
  }),
  component: Page,
});
function Page() {
  return <AccountPage onboarding returnTo={Route.useSearch().returnTo} />;
}
