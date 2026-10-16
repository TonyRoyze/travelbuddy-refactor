import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Shell } from "@/app/shell";
import { Problem, NoResults } from "@/components/feedback";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Shell,
    errorComponent: ({ error }) => <Problem error={error} />,
    notFoundComponent: () => (
      <NoResults
        title="A little off the path"
        description="This page could not be found. Use Explore to find your next experience."
      />
    ),
  },
);
