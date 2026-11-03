import {
  CurrencyNotice,
  useDisplayCurrency,
} from "@/features/currency/currency-provider";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  Home,
  Compass,
  CalendarDays,
  MessageCircle,
  UserRound,
  ShoppingBag,
  Globe,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import { buttonVariants } from "@/components/ui/button";
import { useCart } from "@/features/bookings/cart-provider";
import { ProviderHeartbeat } from "@/features/nearby/provider-heartbeat";
import Avatar04 from "@/components/custom-ui/avatar-04";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/search", label: "Explore Tours", icon: Compass },
  { to: "/bookings", label: "My Bookings", icon: CalendarDays },
  { to: "/inbox", label: "Messages", icon: MessageCircle },
] as const;

export function Brand() {
  return (
    <Link
      to="/"
      aria-label="TravelBuddy home"
      className="inline-flex shrink-0 items-center gap-2.5 font-bold tracking-tight text-foreground transition-opacity hover:opacity-95"
    >
      <span className="brand-mark flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
        <Compass className="size-5" />
      </span>
      <span className="text-xl font-bold tracking-tight md:text-2xl">
        Travel<span className="text-primary">Buddy</span>
      </span>
    </Link>
  );
}

export function Shell() {
  const { session } = useSession();
  const displayCurrency = useDisplayCurrency();
  const { items: cart } = useCart();
  const { pathname } = useLocation();
  const { data: account } = useQuery({ ...accountQuery(), enabled: !!session });
  const buddy = account?.roles.some(
    (role) => role === "provider" || role === "guide",
  );
  const navigation = items.map((item) =>
    buddy && item.to === "/bookings"
      ? { ...item, to: "/account/dashboard" as const, label: "Dashboard" }
      : item,
  );
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
        ? pathname === "/search" ||
          pathname.startsWith("/destinations/") ||
          pathname.startsWith("/experience/")
        : pathname.startsWith(to);

  return (
    <div
      className={cn(
        "min-h-dvh bg-background text-foreground flex flex-col",
        !focused && "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:shadow-md"
      >
        Skip to content
      </a>

      {/* Primary Sticky Header */}
      <header className="site-header sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md transition-colors">
        <div className="mx-auto flex h-16 max-w-[1340px] items-center justify-between gap-4 px-4 sm:px-6 md:h-20 lg:px-8">
          <Brand />

          {!focused && (
            <nav
              className="hidden items-center gap-1 md:flex"
              aria-label="Main navigation"
            >
              {navigation.map((item) => {
                const isSelected = active(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    search={{}}
                    aria-current={isSelected ? "page" : undefined}
                    className={cn(
                      "relative flex h-10 items-center rounded-lg px-3.5 text-sm font-medium transition-colors hover:text-foreground hover:bg-muted/60",
                      isSelected
                        ? "text-primary font-semibold bg-primary/5 hover:bg-primary/10"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                    {isSelected && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          {focused ? (
            <Link
              to="/"
              className="flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              Back to experiences
            </Link>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Currency Badge */}
              <div
                className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:inline-flex"
                title={`Display currency: ${displayCurrency}`}
              >
                <Globe className="size-3.5" />
                <span>{displayCurrency}</span>
              </div>

              {/* Shopping Cart Button */}
              <Link
                to="/cart"
                aria-label={`Shopping cart, ${cart.length} items`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "relative size-10 rounded-full text-foreground hover:bg-muted",
                )}
              >
                <ShoppingBag className="size-5" aria-hidden="true" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-xs animate-in zoom-in-75">
                    {cart.length}
                  </span>
                )}
              </Link>

              {/* User Account Button */}
              <Link
                to={session ? "/account" : "/login"}
                search={{}}
                aria-label={account?.displayName ?? "Sign in"}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-10 rounded-full gap-2 px-3 sm:px-4 font-medium text-xs sm:text-sm border-border hover:bg-muted",
                )}
              >
                {account ? (
                  <Avatar04
                    name={account.displayName}
                    mediaId={account.avatarMediaId}
                  />
                ) : (
                  <UserRound className="size-4 text-muted-foreground" />
                )}
                {!account && <span>Sign in</span>}
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main
        id="main"
        className={cn(
          "flex-1",
          pathname !== "/" && "travel-inner",
          pathname === "/search"
            ? "mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"
            : pathname === "/login" || pathname === "/register"
              ? "mx-auto w-full max-w-md px-4 py-8 sm:py-12"
              : pathname !== "/" &&
                "mx-auto w-full max-w-[1340px] px-4 py-6 sm:px-6 md:py-10 lg:px-8",
        )}
      >
        <CurrencyNotice />
        <ProviderHeartbeat />
        <Outlet />
      </main>

      {/* Clean Modern Viator-style Footer */}
      {!auth && (
        <footer className="mt-20 border-t border-border bg-card/60">
          <div className="mx-auto max-w-[1340px] px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4 pb-12 border-b border-border/80">
              {/* Brand info */}
              <div className="flex flex-col gap-4">
                <Brand />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your trusted marketplace for top-rated tours, day trips,
                  safaris, and local experiences across Sri Lanka.
                </p>
                <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="size-3.5" /> Verified Guides
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheck className="size-3.5" /> Secure Checkout
                  </span>
                </div>
              </div>

              {/* Discover */}
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-foreground tracking-tight">
                  Top Destinations
                </h4>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link to="/destinations/$slug" params={{ slug: "sigiriya" }} className="hover:text-primary transition-colors">
                    Sigiriya Tours & Activities
                  </Link>
                  <Link to="/destinations/$slug" params={{ slug: "ella" }} className="hover:text-primary transition-colors">
                    Ella Hikes & Tea Plantations
                  </Link>
                  <Link to="/destinations/$slug" params={{ slug: "galle" }} className="hover:text-primary transition-colors">
                    Galle Fort & Southern Coast
                  </Link>
                  <Link to="/destinations/$slug" params={{ slug: "kandy" }} className="hover:text-primary transition-colors">
                    Kandy Cultural Heritage
                  </Link>
                  <Link to="/destinations/$slug" params={{ slug: "mirissa" }} className="hover:text-primary transition-colors">
                    Mirissa Whale Watching
                  </Link>
                </div>
              </div>

              {/* Experiences */}
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-foreground tracking-tight">
                  Explore by Category
                </h4>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link to="/search" search={{ category: "Cultural experiences" }} className="hover:text-primary transition-colors">
                    Cultural & Heritage Tours
                  </Link>
                  <Link to="/search" search={{ category: "Outdoor activities" }} className="hover:text-primary transition-colors">
                    Outdoor & Hiking Adventures
                  </Link>
                  <Link to="/search" search={{ category: "Wildlife" }} className="hover:text-primary transition-colors">
                    Safari & Wildlife Encounters
                  </Link>
                  <Link to="/search" search={{ category: "Day trips" }} className="hover:text-primary transition-colors">
                    Full-Day Island Excursions
                  </Link>
                  <Link to="/search" search={{ category: "Food & drink" }} className="hover:text-primary transition-colors">
                    Local Food & Cooking Classes
                  </Link>
                </div>
              </div>

              {/* Provider / Help */}
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-foreground tracking-tight">
                  For Hosts & Travelers
                </h4>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <Link to="/bookings" className="hover:text-primary transition-colors">
                    Manage My Bookings
                  </Link>
                  <Link to="/inbox" className="hover:text-primary transition-colors">
                    Chat with Guides
                  </Link>
                  <Link to="/account" className="hover:text-primary transition-colors">
                    Account & Profile
                  </Link>
                  <Link to="/search" search={{ freeCancellation: true }} className="hover:text-primary transition-colors">
                    Free Cancellation Policy
                  </Link>
                </div>
              </div>
            </div>

            {/* Bottom copyright */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 text-xs text-muted-foreground">
              <p>© 2026 TravelBuddy. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <span>Currency: <strong>{displayCurrency}</strong> (Settled in LKR)</span>
                <span>English</span>
                <span>Secure payments powered by PayHere</span>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Mobile Floating Bottom Dock */}
      {!focused && (
        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto grid h-16 max-w-md grid-cols-5 items-center rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-lg backdrop-blur-lg md:hidden"
        >
          {[
            ...navigation,
            { to: "/account" as const, label: "Profile", icon: UserRound },
          ].map(({ icon: Icon, ...item }) => {
            const isSelected = active(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                search={{}}
                aria-current={isSelected ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-medium transition-colors",
                  isSelected
                    ? "text-primary font-bold bg-primary/10"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
