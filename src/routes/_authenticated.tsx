import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { accountQuery } from "@/lib/queries";
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session)
      throw redirect({ to: "/login", search: { returnTo: location.href } });
    const account = await context.queryClient.fetchQuery({
      ...accountQuery(),
      staleTime: 0,
    });
    if (
      account.onboarding === "pending" &&
      location.pathname !== "/register/complete" &&
      location.pathname !== "/account"
    )
      throw redirect({
        to: "/register/complete",
        search: { returnTo: location.href },
      });
  },
  component: Outlet,
});
