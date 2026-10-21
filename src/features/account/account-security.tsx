import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { accountQuery } from "@/lib/queries";
import { SignOutButton } from "./account-overview";
import { Loading, Problem } from "@/components/feedback";
import { buttonVariants } from "@/components/ui/button";
export function AccountSecurityPage() {
  const query = useQuery(accountQuery());
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-xl border bg-card p-6 md:p-10">
      <Link to="/account">Your account</Link>
      <h1>Hello, {query.data.displayName}.</h1>
      <p>You’re signed in securely.</p>
      <h2>Your TravelBuddy account</h2>
      <p>{query.data.email}</p>
      <p>
        Your profile and bookings are saved securely. Availability is checked
        when you confirm a booking.
      </p>
      <p>
        Account access:{" "}
        {query.data.roles
          .map((role) => (role === "provider" ? "Buddy" : role))
          .join(", ")}
      </p>
      <Link to="/account/settings" className={buttonVariants()}>
        Edit profile
      </Link>
      <Link
        to="/forgot-password"
        className={buttonVariants({ variant: "outline" })}
      >
        Reset password
      </Link>
      <SignOutButton />
    </section>
  );
}
