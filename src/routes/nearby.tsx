import {
  createFileRoute,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { nearbySearchSchema } from "@/features/nearby/model";
import { NearbyPage } from "@/features/nearby/nearby-page";
export const Route = createFileRoute("/nearby")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    nearbySearchSchema.parse(input),
  component: Page,
});
function Page() {
  return <NearbyPage filters={Route.useSearch()} />;
}
