import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CheckoutPage } from "@/features/bookings/checkout-page";
import { selectionSchema } from "@/lib/validation";
const schema = selectionSchema.extend({
  packageId: z.string().min(1).max(80).optional(),
});
export const Route = createFileRoute("/_authenticated/checkout")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    schema.parse(input),
  component: Page,
});
function Page() {
  return (
    <CheckoutPage
      key={JSON.stringify(Route.useSearch())}
      {...Route.useSearch()}
    />
  );
}
