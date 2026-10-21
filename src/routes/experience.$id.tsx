import type { SearchSchemaInput } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { ExperiencePage } from "@/features/catalog/experience-page";
import { z } from "zod";
import { selectionSchema } from "@/lib/validation";
export const Route = createFileRoute("/experience/$id")({
  validateSearch: (input: SearchSchemaInput & Record<string, unknown>) =>
    selectionSchema.extend({ item: z.uuid().optional() }).parse(input),
  component: Page,
});
function Page() {
  return (
    <ExperiencePage
      key={Route.useParams().id + JSON.stringify(Route.useSearch())}
      id={Route.useParams().id}
      initial={Route.useSearch()}
    />
  );
}
