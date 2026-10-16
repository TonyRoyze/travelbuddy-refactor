import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Home,
  Compass,
  CalendarDays,
  MessageCircle,
  UserRound,
  ArrowRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/search", label: "Explore", icon: Compass },
  { to: "/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/inbox", label: "Inbox", icon: MessageCircle },
] as const;
export function Brand() {
  return (
    <Link
      to="/"
      aria-label="TravelBuddy home"
      className="inline-flex shrink-0 items-center gap-2 text-xl font-bold tracking-tight text-foreground md:text-2xl"
    >
      <img src="/brand/buddy-mark.svg" alt="" className="size-7 md:size-9" />
      <span>travelbuddy</span>
    </Link>
  );
}
export function Shell() {
  const { session } = useSession();
  const { pathname } = useLocation();
  const { data: account } = useQuery({ ...accountQuery(), enabled: !!session });
  const auth = [
    "/login",
    "/register",
    "/register/complete",
    "/forgot-password",
    "/reset-password",
    "/auth/callback",
  ].includes(pathname);
  const focused = auth || pathname === "/checkout";
  const active = (to: string) =>
    to === "/"
      ? pathname === "/"
      : to === "/search"
        ? pathname === "/search" || pathname.startsWith("/experience/")
        : pathname.startsWith(to);
  return (
    <div
      className={cn(
        "min-h-dvh",
        !focused && "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 max-w-[1280px] items-center justify-between gap-3 px-4 md:min-h-16 md:px-8 xl:px-10">
          <Brand />
          {!focused && (
            <nav
              className="hidden items-center gap-7 md:flex"
              aria-label="Main navigation"
            >
              {items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  search={{}}
                  aria-current={active(item.to) ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 items-center border-b-2 px-1 text-sm font-semibold transition-colors hover:text-primary",
                    active(item.to)
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          {focused ? (
            <Link
              to="/"
              className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              Back to home
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Link
              to={session ? "/account" : "/login"}
              search={{}}
              aria-label={account?.displayName ?? "Sign in"}
              className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}
            >
              <UserRound data-icon="inline-start" />
              <span className="hidden sm:inline">
                {account?.displayName.split(" ")[0] ??
                  (session ? "Account" : "Sign in")}
              </span>
            </Link>
          )}
        </div>
      </header>
      <main
        id="main"
        className={cn(
          "min-h-[65vh]",
          pathname !== "/" &&
            "mx-auto max-w-[1280px] px-4 py-8 md:px-8 md:py-10 xl:px-10",
        )}
      >
        <Outlet />
      </main>
      {!auth && (
        <footer className="mt-12 border-t bg-secondary md:mt-24">
          <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr] md:items-center md:gap-16 md:px-8 md:py-14 xl:px-10">
            <div className="flex flex-col gap-5">
              <Brand />
              <h2>
                Good company.
                <br />
                Great discoveries.
              </h2>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                Find the experience that feels right. Know what’s included. Keep
                every booking in one place.
              </p>
            </div>
            <div className="flex flex-col gap-6 text-xs text-muted-foreground md:border-l md:px-12 md:py-8">
              <span>© 2026 TravelBuddy</span>
              <span>English · USD</span>
            </div>
          </div>
        </footer>
      )}
      {!focused && (
        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card/95 px-2 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
        >
          {items.map(({ icon: Icon, ...item }) => (
            <Link
              key={item.to}
              to={item.to}
              search={{}}
              aria-current={active(item.to) ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium",
                active(item.to) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-6" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
