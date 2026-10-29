import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CheckoutPage } from "@/features/bookings/checkout-page";
import { selectionSchema } from "@/lib/validation";
const schema = z.union([
  selectionSchema.extend({ packageId: z.string().min(1).max(80) }),
  z.object({
    cart: z.preprocess(
      (value) => (value === true || value === "true" ? true : value),
      z.literal(true),
    ),
  }),
]);
export const Route = createFileRoute("/_authenticated/checkout")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    schema.parse(input),
  component: Page,
});
function Page() {
  const search = Route.useSearch();
  if ("cart" in search)
    return <CheckoutPage key="cart" {...selectionSchema.parse({})} />;
  return (
    <CheckoutPage
      key={JSON.stringify(search)}
      {...search}
    />
  );
}
