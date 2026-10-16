import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { searchSchema } from "@/lib/validation";
export const Route = createFileRoute("/search")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    searchSchema.parse(input),
  component: Page,
});
function Page() {
  return <CatalogPage filters={Route.useSearch()} />;
}
