import { Link, Outlet } from "@tanstack/react-router";
import { Compass, CalendarDays, MessageCircle, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
export function Shell() {
  const { session } = useSession();
  const { data: account } = useQuery({ ...accountQuery(), enabled: !!session });
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <Compass aria-hidden="true" />
            TravelBuddy<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link to="/search" search={{}}>
              Explore
            </Link>
            <Link to="/bookings">
              <CalendarDays aria-hidden="true" />
              <span>Bookings</span>
            </Link>
            <Link to="/inbox" search={{}}>
              <MessageCircle aria-hidden="true" />
              <span>Inbox</span>
            </Link>
          </nav>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={session ? "/account" : "/login"} search={{}} />}
          >
            <UserRound data-icon="inline-start" />
            {account?.displayName ?? (session ? "Account" : "Sign in")}
          </Button>
        </div>
      </header>
      <main id="main" className="page">
        <Outlet />
      </main>
      <footer className="site-footer">
        <Link to="/" className="brand">
          TravelBuddy.
        </Link>
        <p>Go somewhere. Meet someone. Bring back a story.</p>
        <span>Made for curious travelers.</span>
      </footer>
    </>
  );
}
