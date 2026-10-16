import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InboxPage } from "@/features/messaging/inbox-page";
import { safeReturn } from "@/lib/validation";
const schema = z.object({
  conversation: z.uuid().optional(),
  packageId: z.string().min(1).max(80).optional(),
  returnTo: z.preprocess(
    (v) => (v ? safeReturn(v) : undefined),
    z.string().optional(),
  ),
});
export const Route = createFileRoute("/_authenticated/inbox")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    schema.parse(input),
  component: Page,
});
function Page() {
  return <InboxPage {...Route.useSearch()} />;
}
