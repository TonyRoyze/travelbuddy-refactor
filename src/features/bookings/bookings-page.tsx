import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { bookingsQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { money } from "@/lib/validation";
import { Media } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import { Problem, Loading, NoResults } from "@/components/feedback";
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
  const cancel = useMutation({
    mutationFn: (id: string) => rpc("cancel_booking", { booking_id: id }),
    onSuccess: () => {
      setConfirmCancel(undefined);
      client.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  const rows = id ? query.data.filter((b) => b.id === id) : query.data;
  return (
    <section>
      <div className="section-heading">
        <div>
          {confirmation && (
            <CheckCircle2 className="mb-4 size-10 text-primary" />
          )}
          <h1>
            {confirmation
              ? "You’re going places."
              : id
                ? "Your booking"
                : "Plans worth looking forward to"}
          </h1>
          <p>
            {confirmation
              ? "Your reservation is confirmed. Your host will be ready to welcome you."
              : "All your experiences, together in one place."}
          </p>
        </div>
      </div>
      {cancel.error && <Problem error={cancel.error} />}
      <div className="flex flex-col gap-5">
        {rows.length === 0 ? (
          <NoResults
            title={id ? "Booking not found" : "Your next adventure is waiting"}
            description="Explore experiences and make a plan."
          />
        ) : (
          rows.map((b) => (
            <article className="booking-row" key={b.id}>
              <Media src={b.experience.image} alt={b.experience.title} />
              <div className="flex flex-col gap-2">
                <p className="text-primary">
                  {b.status} · {b.reference}
                </p>
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
