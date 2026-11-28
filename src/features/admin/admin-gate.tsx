import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Loading, NoResults, Problem } from "@/components/custom-ui/feedback";
import { accountQuery } from "@/lib/queries";

export function AdminGate({ children }: { children: ReactNode }) {
  const account = useQuery(accountQuery());
  if (account.isPending) return <Loading />;
  if (account.error) return <Problem error={account.error} />;
  if (!account.data.roles.includes("admin")) {
    return (
      <NoResults
        title="Administrator access required"
        description="Sign in with an administrator account to review buddy applications."
      />
    );
  }
  return children;
}
