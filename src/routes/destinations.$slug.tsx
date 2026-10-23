import { createFileRoute } from "@tanstack/react-router";
import { DestinationPage } from "@/features/catalog/destination-page";
export const Route = createFileRoute("/destinations/$slug")({
  component: Page,
});
function Page() {
  return <DestinationPage slug={Route.useParams().slug} />;
}
