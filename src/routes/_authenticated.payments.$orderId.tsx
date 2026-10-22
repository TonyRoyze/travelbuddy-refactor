import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { PaymentPage } from "@/features/payments/payment-page";
export const Route = createFileRoute("/_authenticated/payments/$orderId")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) => ({
    returned:
      input.returned === "1" || input.returned === 1 || input.returned === true,
  }),
  component: Page,
});
function Page() {
  const { orderId } = Route.useParams();
  const { returned } = Route.useSearch();
  return (
    <PaymentPage
      key={orderId + String(returned)}
      orderId={orderId}
      returned={returned}
    />
  );
}
