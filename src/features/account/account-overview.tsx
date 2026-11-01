import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Settings,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
  ShoppingBag,
  UserRound,
  Package,
  Star,
  LogOut,
  Pencil,
} from "lucide-react";
import type { Account } from "./types";
import { ProfileAvatar } from "./profile-avatar";
import { ProviderControls } from "@/features/nearby/provider-controls";
import { broadcastLiveNowChange } from "@/lib/live-now";
import { rpc, supabase } from "@/lib/supabase";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Problem } from "@/components/feedback";
export function SignOutButton() {
  const client = useQueryClient(),
    navigate = useNavigate();
  const logout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      client.clear();
      await navigate({ to: "/login", search: {} });
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="destructive"
        size="sm"
        aria-label={logout.isPending ? "Signing out" : "Sign out"}
        title={logout.isPending ? "Signing out…" : "Sign out"}
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" />
        Sign out
      </Button>
      {logout.error && <Problem error={logout.error} />}
    </div>
  );
}
export function AccountOverview({ account: a }: { account: Account }) {
  const buddy = a.roles.some((role) => role === "provider" || role === "guide");
  const travellerLinks = [
    {
      to: "/bookings" as const,
      icon: CalendarDays,
      label: "Your bookings",
      description: "Your upcoming discoveries and past experiences",
    },
    {
      to: "/cart" as const,
      icon: ShoppingBag,
      label: "Your cart",
      description: "Review the experiences you’re planning",
    },
    {
      to: "/inbox" as const,
      icon: MessageCircle,
      label: "Your inbox",
      description: "Conversations with local hosts and travelers",
    },
    {
      to: "/account/reviews" as const,
      icon: Star,
      label: "Your reviews",
      description: "Review completed experiences and see your feedback",
    },
    {
      to: "/account/settings" as const,
      icon: Settings,
      label: "Account settings",
      description: "Edit your profile, photo and display preferences",
    },
    {
      to: "/account/security" as const,
      icon: ShieldCheck,
      label: "Account access",
      description: "Your sign-in and password options",
    },
  ];
  const links = buddy
    ? [
        {
          to: "/account/dashboard" as const,
          icon: CalendarDays,
          label: "Bookings & conversations",
          description: "Guest reservations, arrivals and your traveler inbox",
        },
        {
          to: "/account/packages" as const,
          icon: Package,
          label: "My packages",
          description:
            "Create experiences, manage drafts, schedules and reserved places",
        },
        {
          to: "/account/profile" as const,
          icon: UserRound,
          label: "Buddy profile",
          description:
            "Your public introduction, photo, local knowledge and video clips",
        },
        {
          to: "/inbox" as const,
          icon: MessageCircle,
          label: "Traveller conversations",
          description: "Answer questions and plan experiences with your guests",
        },
        {
          to: "/account/security" as const,
          icon: ShieldCheck,
          label: "Account access",
          description: "Your sign-in and password options",
        },
      ]
    : travellerLinks;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1>Hello, {a.displayName.trim().split(/\s+/)[0]}.</h1>
        <p className="mt-3 text-muted-foreground">
          {buddy
            ? "Your Buddy dashboard. Manage your experiences and welcome travellers."
            : "A little curiosity. Everything in one place."}
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="w-full max-w-full">
          <CardContent className="flex items-center gap-4">
            <div className="relative shrink-0">
              <ProfileAvatar
                name={a.displayName}
                mediaId={a.avatarMediaId}
                className="size-20"
              />
              <Badge
                className="absolute left-1 top-1 border-2 border-white"
                variant="secondary"
                aria-label={buddy ? "Buddy" : "Traveller"}
                title={buddy ? "Buddy" : "Traveller"}
              >
                {buddy ? "B" : "T"}
              </Badge>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle>{a.displayName}</CardTitle>
              <CardDescription className="break-all">{a.email}</CardDescription>
              {a.profileDetails.homeBase && (
                <p className="text-sm text-muted-foreground">
                  {a.profileDetails.homeBase}
                </p>
              )}
            </div>
          </CardContent>
          <CardContent className="grid w-full grid-cols-3 gap-2 pt-0 [&>*]:w-full">
            <Link
              to={buddy ? "/account/profile" : "/account/settings"}
              aria-label="Edit profile"
              title="Edit profile"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Link>
            {buddy && (
              <Link
                to="/buddy/$id"
                params={{ id: a.id }}
                aria-label="View public profile"
                title="View public profile"
                className={buttonVariants({ variant: "default", size: "sm" })}
              >
                <UserRound data-icon="inline-start" />
                View
              </Link>
            )}
            <SignOutButton />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <div className="divide-y rounded-xl border bg-card">
            {links.map(({ to, icon: Icon, label, description }) => (
              <Link
                key={to}
                to={to}
                className="flex min-h-24 items-center gap-4 p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="rounded-lg bg-secondary p-3 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <strong>{label}</strong>
                  <span className="text-sm text-muted-foreground">
                    {description}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0" />
              </Link>
            ))}
          </div>
          {buddy && (
            <Card>
              <CardContent>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
                  <div>
                    <h2 className="font-semibold">Live Now availability</h2>
                    <p className="text-sm text-muted-foreground">
                      Let travellers know when you’re available right now.
                    </p>
                    <p className="mt-2 text-sm" role="status">
                      Currently {a.liveNow ? "live" : "offline"}
                    </p>
                  </div>
                  <LiveNowButton liveNow={a.liveNow} />
                </div>
                <ProviderControls />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

function LiveNowButton({ liveNow }: { liveNow: boolean }) {
  const client = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => rpc("set_live_now", { live_now: !liveNow }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["account"] }),
        client.invalidateQueries({ queryKey: ["catalog"] }),
        client.invalidateQueries({ queryKey: ["package"] }),
      ]);
      broadcastLiveNowChange();
    },
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={liveNow ? "default" : "outline"}
        aria-pressed={liveNow}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {toggle.isPending ? "Updating…" : liveNow ? "Go Offline" : "Go Live"}
      </Button>
      {toggle.error && <Problem error={toggle.error} />}
    </div>
  );
}
