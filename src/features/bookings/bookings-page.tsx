import { useMoney } from "@/features/currency/currency-provider";
import { Badge } from "@/components/ui/badge";
import { BookingPolicy } from "./policy";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { bookingsQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { money as settlementMoney } from "@/lib/validation";
import { Media } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Problem, Loading, NoResults } from "@/components/custom-ui/feedback";
import type { Booking } from "./types";

type HistoryFilter = "all" | "upcoming" | "completed" | "cancelled";

const historyFilters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All bookings" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function bookingDateTime(booking: Booking) {
  return `${booking.date}T${booking.time}`;
}

function compareHistory(a: Booking, b: Booking) {
  const statusOrder = { Upcoming: 0, Completed: 1, Cancelled: 2 } as const;
  const statusDifference = statusOrder[a.status] - statusOrder[b.status];
  if (statusDifference !== 0) return statusDifference;
  const dateDifference = bookingDateTime(a).localeCompare(bookingDateTime(b));
  return a.status === "Upcoming" ? dateDifference : -dateDifference;
}

export function BookingsPage({
  id,
  confirmation = false,
}: {
  id?: string;
  confirmation?: boolean;
}) {
  const money = useMoney();
  const query = useQuery(bookingsQuery());
  const client = useQueryClient();
  const navigate = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState<string>();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const cancel = useMutation({
    mutationFn: (id: string) => rpc("cancel_booking", { booking_id: id }),
    onSuccess: () => {
      setConfirmCancel(undefined);
      client.invalidateQueries({ queryKey: ["bookings"] });
      client.invalidateQueries({ queryKey: ["payment-order"] });
    },
  });
  const chat = useMutation({
    mutationFn: (id: string) => rpc("booking_chat", { booking_id: id }),
    onSuccess: (conversation) =>
      navigate({
        to: "/inbox",
        search: { conversation, returnTo: "/bookings" },
      }),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  const confirmed =
    confirmation && id ? query.data.find((b) => b.id === id) : undefined;
  const accountBookings = confirmed
    ? query.data.filter((b) => b.orderId === confirmed.orderId)
    : id
      ? query.data.filter((b) => b.id === id)
      : query.data;
  const historyMode = !id && !confirmation;
  const counts = {
    all: accountBookings.length,
    upcoming: accountBookings.filter((b) => b.status === "Upcoming").length,
    completed: accountBookings.filter((b) => b.status === "Completed").length,
    cancelled: accountBookings.filter((b) => b.status === "Cancelled").length,
  };
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const rows = (historyMode
    ? accountBookings.filter((b) =>
        historyFilter === "all"
          ? true
          : b.status.toLocaleLowerCase() === historyFilter,
      )
    : accountBookings
  )
    .filter((b) =>
      !normalizedSearch
        ? true
        : [b.experience.title, b.experience.destination, b.reference]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedSearch),
    )
    .sort(compareHistory);
  return (
    <section>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h1]:mb-3 [&_p]:text-muted-foreground">
        <div>
          {confirmation && (
            <CheckCircle2 className="mb-4 size-10 text-primary" />
          )}
          <h1>
            {confirmation && confirmed?.paymentStatus === "pending"
              ? "Complete payment to confirm"
              : confirmation && confirmed?.paymentStatus === "expired"
                ? "Payment window ended"
                : confirmation
                  ? "You’re going places."
                  : id
                    ? "Your booking"
                    : "Booking history"}
          </h1>
          <p>
            {confirmation && confirmed?.paymentStatus === "pending"
              ? "Your places are held temporarily while payment is pending."
              : confirmation && confirmed?.paymentStatus === "expired"
                ? "Unpaid places have been released. Choose another available time."
                : confirmation
                  ? rows.length > 1
                    ? "Your reservations are confirmed. Your hosts will be ready to welcome you."
                    : "Your reservation is confirmed. Your host will be ready to welcome you."
                  : id
                    ? "Review the details and status of this reservation."
                    : "Review upcoming plans, completed experiences, and cancelled reservations."}
          </p>
        </div>
      </div>
      {historyMode && (
        <div className="mb-8 flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["upcoming", "completed", "cancelled"] as const).map(
              (status) => (
                <div key={status} className="rounded-xl border bg-card p-4">
                  <p className="text-sm capitalize text-muted-foreground">
                    {status} bookings
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{counts[status]}</p>
                </div>
              ),
            )}
          </div>
          <Input
            aria-label="Search booking history"
            placeholder="Search by experience, destination, or reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={120}
          />
          <div
            role="group"
            className="flex flex-wrap gap-2"
            aria-label="Filter bookings"
          >
            {historyFilters.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                variant={historyFilter === filter.value ? "default" : "outline"}
                aria-pressed={historyFilter === filter.value}
                onClick={() => setHistoryFilter(filter.value)}
              >
                {filter.label} ({counts[filter.value]})
              </Button>
            ))}
          </div>
        </div>
      )}
      {cancel.error && <Problem error={cancel.error} />}
      {chat.error && <Problem error={chat.error} />}
      <div className="flex flex-col gap-5">
        {rows.length === 0 ? (
          <NoResults
            title={
              id
                ? "Booking not found"
                : normalizedSearch
                  ? "No matching bookings"
                  : historyFilter === "all"
                    ? "Your next adventure is waiting"
                    : `No ${historyFilter} bookings`
            }
            description={
              id
                ? "This booking is not in your account history."
                : normalizedSearch
                  ? "Try another experience name, destination, or booking reference."
                  : "Explore experiences and make a plan."
            }
          />
        ) : (
          rows.map((b) => (
            <article
              className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-[180px_1fr] md:gap-8 md:p-6 [&>img]:aspect-[4/3] [&>img]:w-full [&>img]:rounded-lg [&>img]:object-cover [&_h2]:text-xl [&_h2]:leading-snug"
              key={b.id}
            >
              <Media src={b.experience.image} alt={b.experience.title} />
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{b.status}</Badge>
                  <Badge variant="outline">
                    {b.paymentStatus === "disputed"
                      ? "Payment disputed"
                      : b.paymentStatus === "paid"
                        ? "Paid"
                        : b.paymentStatus === "pending"
                          ? "Awaiting payment"
                          : b.paymentStatus === "expired"
                            ? "Payment expired"
                            : "Due on arrival"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {b.reference}
                  </span>
                </div>
                <Link to="/booking/$id" params={{ id: b.id }}>
                  <h2>{b.experience.title}</h2>
                </Link>
                <p>
                  {b.date} at {b.time} · {b.travelers} traveler
                  {b.travelers === 1 ? "" : "s"}
                </p>
                <p>{b.experience.options[b.option]?.name}</p>
                <strong>{money(b.total, b.currency ?? "USD")}</strong>
                <BookingPolicy
                  experience={b.experience}
                  date={b.date}
                  time={b.time}
                />
                {b.paymentStatus === "due" && b.status !== "Cancelled" && (
                  <p>
                    Amount due to your Buddy on arrival:{" "}
                    {settlementMoney(b.total, b.currency ?? "USD")}.
                  </p>
                )}
                {b.refundStatus && (
                  <p role="status">
                    Refund{" "}
                    {b.refundStatus === "refunded"
                      ? "processed to your original payment method."
                      : "pending. Your cancellation is recorded; the refund will be confirmed after gateway processing."}
                  </p>
                )}
                {b.paymentStatus === "pending" && (
                  <Link
                    to="/payments/$orderId"
                    params={{ orderId: b.orderId }}
                    className="text-primary"
                  >
                    Complete payment
                  </Link>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={chat.isPending}
                    onClick={() => chat.mutate(b.id)}
                  >
                    Contact provider
                  </Button>
                  {b.canCancel && (
                    <Button
                      variant="outline"
                      disabled={cancel.isPending}
                      onClick={() => setConfirmCancel(b.id)}
                    >
                      Cancel reservation
                    </Button>
                  )}
                </div>
                {confirmCancel === b.id && (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center gap-3"
                  >
                    <p>
                      {b.paymentStatus === "pending"
                        ? "Release this unpaid order? All items in the payment order will be released."
                        : "Cancel this reservation under its displayed cancellation policy? Eligible online payments will be queued for refund."}
                    </p>
                    <Button
                      variant="destructive"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(b.id)}
                    >
                      Confirm cancellation
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmCancel(undefined)}
                    >
                      Keep reservation
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      <Link to="/search" search={{}} className="mt-8 inline-block text-primary">
        Find another experience
      </Link>
    </section>
  );
}
