import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";
import { Loading } from "@/components/custom-ui/feedback";
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPendingComponent: Loading,
  scrollRestoration: true,
  defaultPreload: "intent",
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
