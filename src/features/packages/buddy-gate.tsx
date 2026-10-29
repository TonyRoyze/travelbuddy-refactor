import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { accountQuery } from "@/lib/queries";
import { Loading, Problem, NoResults } from "@/components/custom-ui/feedback";
import { Link } from "@tanstack/react-router";
export function BuddyGate({ children }: { children: ReactNode }) {
  const account = useQuery(accountQuery());
  if (account.isPending) return <Loading />;
  if (account.error) return <Problem error={account.error} />;
  if (!account.data.roles.some((role) => ["provider", "guide"].includes(role)))
    return (
      <div className="flex flex-col gap-5">
        <NoResults
          title="Packages are for Buddy accounts"
          description="Sign in with a Buddy or Guide account to manage experiences."
        />
        <Link to="/account" className="text-primary">
          Back to your account
        </Link>
      </div>
    );
  return children;
}
