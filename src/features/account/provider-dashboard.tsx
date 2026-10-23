import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { rpc } from "@/lib/supabase";
import { money } from "@/lib/validation";
import type { Booking } from "@/features/bookings/types";
import type { Conversation } from "@/features/messaging/types";
import { BuddyGate } from "@/features/packages/buddy-gate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading, Problem, NoResults } from "@/components/feedback";

interface Dashboard {
  items: Booking[];
  total: number;
  pageSize: number;
  upcoming: number;
  today: number;
  conversations: Conversation[];
}
export function ProviderDashboardPage() {
  return (
    <BuddyGate>
      <DashboardContent />
    </BuddyGate>
  );
}
function DashboardContent() {
  const [filters, setFilters] = useState({
    status: "Upcoming",
    date: "",
    q: "",
    page: 1,
  });
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["provider-dashboard", filters],
    queryFn: async () =>
      (await rpc("provider_dashboard", { filters })) as unknown as Dashboard,
    refetchInterval: 15000,
  });
  const chat = useMutation({
    mutationFn: (id: string) => rpc("booking_chat", { booking_id: id }),
    onSuccess: (id) =>
      navigate({
        to: "/inbox",
        search: { conversation: id, returnTo: "/account/dashboard" },
      }),
  });
  return (
    <section className="flex flex-col gap-6">
      <Link to="/account" className="text-primary">
        Your account
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Bookings &amp; conversations</h1>
          <p className="mt-3 text-muted-foreground">
            Welcome your guests, check their plans and keep in touch.
          </p>
        </div>
        <Link
          to="/account/packages"
          className={buttonVariants({ variant: "outline" })}
        >
          Manage packages
        </Link>
      </div>
      {query.error && <Problem error={query.error} />}
      {chat.error && <Problem error={chat.error} />}
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Upcoming bookings", query.data.upcoming],
                ["Arriving today", query.data.today],
                [
                  "Unread messages",
                  query.data.conversations.reduce(
                    (n, t) => n + (t.unread ?? 0),
                    0,
                  ),
                ],
              ].map(([label, value]) => (
                <Card key={label}>
                  <CardHeader>
                    <CardDescription>{label}</CardDescription>
                    <CardTitle>{value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    setFilters({
                      status: String(data.get("status")),
                      date: String(data.get("date")),
                      q: String(data.get("q")),
                      page: 1,
                    });
                  }}
                >
                  <FieldGroup className="grid gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="booking-status">
                        Booking status
                      </FieldLabel>
                      <NativeSelect
                        id="booking-status"
                        name="status"
                        defaultValue={filters.status}
                      >
                        {["All", "Upcoming", "Completed", "Cancelled"].map(
                          (s) => (
                            <NativeSelectOption key={s}>{s}</NativeSelectOption>
                          ),
                        )}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="booking-date">
                        Experience date
                      </FieldLabel>
                      <Input id="booking-date" name="date" type="date" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="booking-search">
                        Guest or reference
                      </FieldLabel>
                      <Input id="booking-search" name="q" maxLength={120} />
                    </Field>
                    <Button type="submit" className="sm:col-span-3">
                      Find bookings
                    </Button>
                  </FieldGroup>
                </form>
                <p className="text-sm text-muted-foreground">
                  {query.data.total} matching bookings · All times in Sri Lanka
                </p>
                {!query.data.items.length && (
                  <NoResults
                    title="No bookings here yet"
                    description="Confirmed reservations for your experiences will appear here."
                  />
                )}
                {query.data.items.map((b) => (
                  <Card key={b.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge
                          variant={
                            b.status === "Cancelled" ? "outline" : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {b.reference}
                        </span>
                      </div>
                      <CardTitle>{b.experience.title}</CardTitle>
                      <CardDescription>
                        {b.date} at {b.time} · {b.travelers} guests ·{" "}
                        {b.experience.options[b.option]?.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <strong>{b.travelerName}</strong>
                      <a
                        href={`mailto:${b.travelerEmail}`}
                        className="break-all text-primary"
                      >
                        {b.travelerEmail}
                      </a>
                      <p>
                        Booking total: {money(b.total, b.currency ?? "USD")}
                      </p>
                      <p>
                        {b.status === "Cancelled"
                          ? "Cancelled; nothing due"
                          : b.paymentStatus === "disputed"
                            ? "Payment disputed: contact support"
                            : b.paymentStatus === "paid"
                              ? "Paid online"
                              : b.paymentStatus === "pending"
                                ? "Awaiting online payment"
                                : b.paymentStatus === "expired"
                                  ? "Payment expired"
                                  : `Due on arrival: ${money(b.total, b.currency ?? "USD")}`}
                      </p>
                      {b.refundStatus && <p>Refund: {b.refundStatus}</p>}
                      <Button
                        variant="outline"
                        disabled={chat.isPending}
                        onClick={() => chat.mutate(b.id)}
                      >
                        Message traveler
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                <div className="flex items-center justify-between gap-4">
                  <Button
                    variant="outline"
                    disabled={filters.page === 1}
                    onClick={() =>
                      setFilters({ ...filters, page: filters.page - 1 })
                    }
                  >
                    Previous
                  </Button>
                  <span>Page {filters.page}</span>
                  <Button
                    variant="outline"
                    disabled={
                      filters.page * query.data.pageSize >= query.data.total
                    }
                    onClick={() =>
                      setFilters({ ...filters, page: filters.page + 1 })
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Traveler inbox</CardTitle>
                  <CardDescription>
                    Questions and conversations for your experiences.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {!query.data.conversations.length && (
                    <p className="text-muted-foreground">
                      No conversations yet.
                    </p>
                  )}
                  {query.data.conversations.map((t) => (
                    <Link
                      key={t.id}
                      to="/inbox"
                      search={{
                        conversation: t.id,
                        returnTo: "/account/dashboard",
                      }}
                      className="flex flex-col gap-1 rounded-lg border p-3"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <strong>{t.name}</strong>
                        {!!t.unread && <Badge>{t.unread} unread</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.packageTitle}
                      </span>
                      <p className="truncate text-sm">
                        {t.preview ?? "Start a conversation"}
                      </p>
                    </Link>
                  ))}
                  <Link
                    to="/inbox"
                    search={{ returnTo: "/account/dashboard" }}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Open inbox
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        )
      )}
    </section>
  );
}
