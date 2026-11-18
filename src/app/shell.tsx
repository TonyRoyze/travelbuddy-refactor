import { useEffect, useState } from "react";
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
  Moon,
  Sun,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import { buttonVariants } from "@/components/ui/button";
import { useCart } from "@/features/bookings/cart-provider";
import { ProviderHeartbeat } from "@/features/nearby/provider-heartbeat";
import Avatar04 from "@/components/custom-ui/avatar-04";
import { useTheme } from "@/app/theme";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/search", label: "Explore", icon: Compass },
  { to: "/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/inbox", label: "Inbox", icon: MessageCircle },
] as const;

export function Brand() {
  return (
    <Link to="/" aria-label="UTrippers home" className="utrippers-brand">
      <img
        src="/brand/utrippers-horizontal-white.svg"
        width="164"
        height="53"
        alt=""
      />
    </Link>
  );
}

export function Shell() {
  const { resolvedTheme, setTheme } = useTheme();
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => {
    const update = () => {
      const element = document.activeElement;
      setInputFocused(
        element instanceof HTMLElement &&
          (element.matches("input:not([type=hidden]), textarea, select") ||
            element.isContentEditable),
      );
    };
    const onFocusOut = () => queueMicrotask(update);
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
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
        "utrippers-shell min-h-dvh bg-background text-foreground flex flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
        focused
          ? "pb-[env(safe-area-inset-bottom)]"
          : "pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:shadow-md"
      >
        Skip to content
      </a>
      {/* Primary Sticky Header */}
      <header className="site-header sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-colors">
        <div className="utrippers-header-inner mx-auto flex h-16 max-w-[1340px] items-center justify-between gap-4 px-4 sm:px-6 md:h-20 lg:px-8">
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
              <button
                type="button"
                className="theme-toggle"
                aria-label={
                  resolvedTheme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
              >
                {resolvedTheme === "dark" ? (
                  <Sun size={20} />
                ) : (
                  <Moon size={20} />
                )}
              </button>

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
        <footer className="utrippers-footer">
          <div className="utrippers-footer-inner">
            <div>
              <Brand />
              <h2>
                Good company.
                <br />
                Great discoveries.
              </h2>
              <p>
                Find the experience that feels right. Know what’s
                <br className="hidden sm:block" /> included. Keep every booking
                in one place.
              </p>
            </div>
            <div className="utrippers-footer-meta">
              <Link to="/search" search={{ freeCancellation: true }}>
                Free cancellation
              </Link>
              <p>English · {displayCurrency} · Payments settled in LKR</p>
              <p>© 2026 UTrippers</p>
            </div>
          </div>
        </footer>
      )}

      {/* Mobile bottom navigation */}
      {!focused && !inputFocused && (
        <nav
          aria-label="Mobile navigation"
          className="mobile-dock fixed inset-x-0 bottom-0 z-40 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 items-center border-t border-border/70 px-2 pt-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden"
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
                  "flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition-colors",
                  isSelected
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-[1.35rem] shrink-0",
                    isSelected && "stroke-[2.25]",
                  )}
                />
                <span className="max-w-full truncate leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
