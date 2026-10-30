import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import type { Booking } from "@/features/bookings/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { rpc } from "@/lib/supabase";
import { Loading, NoResults, Problem } from "@/components/feedback";

type Review = {
  id: string;
  bookingId: string;
  experienceId: string;
  rating: number;
  body: string;
  createdAt: string;
  author?: string;
  experience?: Booking["experience"];
};
type ReviewDashboard = { eligible: Booking[]; reviews: Review[] };
type ExperienceReviews = {
  rating: number;
  reviews: number;
  items: Review[];
};

export function ReviewsPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["review-dashboard"],
    queryFn: async () =>
      (await rpc("review_dashboard", {})) as unknown as ReviewDashboard,
  });
  const submit = useMutation({
    mutationFn: (input: { bookingId: string; rating: number; body: string }) =>
      rpc("submit_review", {
        booking_id: input.bookingId,
        rating: input.rating,
        body: input.body,
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["review-dashboard"] }),
        client.invalidateQueries({ queryKey: ["package"] }),
        client.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1>Reviews</h1>
        <p className="text-muted-foreground">
          Share feedback about experiences you have completed. Reviews are tied
          to confirmed bookings.
        </p>
      </header>
      {submit.error && <Problem error={submit.error} />}
      <section className="flex flex-col gap-4">
        <h2>Ready to review</h2>
        {query.data.eligible.length === 0 ? (
          <NoResults
            title="No experiences ready for a review"
            description="Completed confirmed bookings will appear here."
          />
        ) : (
          query.data.eligible.map((booking) => (
            <ReviewForm
              key={booking.id}
              booking={booking}
              pending={submit.isPending}
              onSubmit={(rating, body) =>
                submit.mutate({ bookingId: booking.id, rating, body })
              }
            />
          ))
        )}
      </section>
      <section className="flex flex-col gap-4">
        <h2>Your reviews</h2>
        {query.data.reviews.length === 0 ? (
          <p className="text-muted-foreground">You have not written a review yet.</p>
        ) : (
          query.data.reviews.map((review) => (
            <article key={review.id} className="rounded-xl border bg-card p-5">
              <Link
                to="/experience/$id"
                params={{ id: review.experienceId }}
                className="font-semibold text-primary"
              >
                {review.experience?.title ?? "Experience"}
              </Link>
              <p aria-label={`${review.rating} out of 5 stars`}>
                {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
              </p>
              <p className="whitespace-pre-wrap">{review.body}</p>
              <time className="text-sm text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString()}
              </time>
            </article>
          ))
        )}
      </section>
    </section>
  );
}

function ReviewForm({
  booking,
  pending,
  onSubmit,
}: {
  booking: Booking;
  pending: boolean;
  onSubmit: (rating: number, body: string) => void;
}) {
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(Number(rating), body.trim());
  }
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
    >
      <Link
        to="/experience/$id"
        params={{ id: booking.experienceId }}
        className="font-semibold text-primary"
      >
        {booking.experience.title}
      </Link>
      <p className="text-sm text-muted-foreground">
        {booking.date} at {booking.time}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`review-rating-${booking.id}`}>Rating</FieldLabel>
          <select
            id={`review-rating-${booking.id}`}
            className="h-10 rounded-md border bg-background px-3"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            required
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} out of 5 stars
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`review-body-${booking.id}`}>Your review</FieldLabel>
          <Textarea
            id={`review-body-${booking.id}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={20}
            maxLength={1000}
            rows={4}
            required
          />
          <p className="text-sm text-muted-foreground">
            {body.trim().length}/1000 characters (at least 20)
          </p>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending || body.trim().length < 20}>
        {pending ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}

export function ExperienceReviews({ packageId }: { packageId: string }) {
  const query = useQuery({
    queryKey: ["experience-reviews", packageId],
    queryFn: async () =>
      (await rpc("experience_reviews", {
        package_id: packageId,
      })) as unknown as ExperienceReviews,
  });
  if (query.isPending) return <p className="text-muted-foreground">Loading reviews…</p>;
  if (query.error) return <Problem error={query.error} />;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="experience-reviews-heading">
      <h2 id="experience-reviews-heading">
        Traveler reviews ({query.data.reviews})
      </h2>
      {query.data.reviews > 0 && (
        <p aria-label={`Average rating ${query.data.rating} out of 5`}>
          {query.data.rating.toFixed(2)} / 5 · {query.data.reviews} verified reviews
        </p>
      )}
      {query.data.items.length === 0 ? (
        <p className="text-muted-foreground">No traveler reviews yet.</p>
      ) : (
        query.data.items.map((review) => (
          <article key={review.id} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <strong>{review.author ?? "Traveler"}</strong>
              <span aria-label={`${review.rating} out of 5 stars`}>
                {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{review.body}</p>
            <time className="text-sm text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString()}
            </time>
          </article>
        ))
      )}
      {query.data.reviews > query.data.items.length && (
        <p className="text-sm text-muted-foreground">
          Showing the 100 most recent reviews.
        </p>
      )}
      <Link to="/account/reviews" className={buttonVariants({ variant: "outline" })}>
        Write a review
      </Link>
    </section>
  );
}
