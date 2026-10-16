import { createFileRoute } from "@tanstack/react-router";
import { BookingsPage } from "@/features/bookings/bookings-page";
export const Route = createFileRoute("/_authenticated/booking/$id")({
  component: Page,
});
function Page() {
  return <BookingsPage id={Route.useParams().id} confirmation={false} />;
}
