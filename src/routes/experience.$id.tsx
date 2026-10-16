import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { ExperiencePage } from "@/features/catalog/experience-page";
import { selectionSchema } from "@/lib/validation";
export const Route = createFileRoute("/experience/$id")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    selectionSchema.parse(input),
  component: Page,
});
function Page() {
  return (
    <ExperiencePage
      key={Route.useParams().id}
      id={Route.useParams().id}
      initial={Route.useSearch()}
    />
  );
}
