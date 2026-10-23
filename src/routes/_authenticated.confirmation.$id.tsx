import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BookingsPage } from "@/features/bookings/bookings-page";
export const Route = createFileRoute("/_authenticated/confirmation/$id")({
  validateSearch: z.object({ orderId: z.uuid().optional() }),
  component: Page,
});
function Page() {
  return (
    <BookingsPage
      id={Route.useParams().id}
      confirmation={true}
    />
  );
}
