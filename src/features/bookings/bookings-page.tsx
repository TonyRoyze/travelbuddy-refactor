import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { bookingsQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { money } from "@/lib/validation";
import { Media } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Problem, Loading, NoResults } from "@/components/feedback";
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
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  const historyMode = !id && !confirmation;
  const accountBookings = id
    ? query.data.filter((b) => b.id === id)
    : query.data;
  const counts = {
    all: query.data.length,
    upcoming: query.data.filter((b) => b.status === "Upcoming").length,
    completed: query.data.filter((b) => b.status === "Completed").length,
    cancelled: query.data.filter((b) => b.status === "Cancelled").length,
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
            {confirmation
              ? "You’re going places."
              : id
                ? "Your booking"
                : "Booking history"}
          </h1>
          <p>
            {confirmation
              ? "Your reservation is confirmed. Your host will be ready to welcome you."
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
                <strong>{money(b.total)}</strong>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: "/inbox",
                        search: { packageId: b.experienceId },
                      })
                    }
                  >
                    Contact provider
                  </Button>
                  {b.status === "Upcoming" && b.experience.freeCancellation && (
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
                      Cancel this reservation? Free cancellation ends 24 hours
                      before departure.
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
