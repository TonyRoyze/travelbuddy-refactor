import { useRef, useState, type FormEvent } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { accountQuery, packageQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { money, type Selection } from "@/lib/validation";
import type { Availability } from "@/features/catalog/types";
import { useSession } from "@/features/auth/session";
import type { Booking } from "./types";
import { readAttempt, saveAttempt } from "./attempt";
import { useCart } from "./cart-provider";
import {
  cartTotal,
  checkCapacity,
  type CartItem,
  type ReviewedItem,
} from "./cart";
import { BookingSummary, CartStorageNotice } from "./cart-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Problem, Loading, NoResults } from "@/components/feedback";

export function CheckoutPage({
  packageId,
  ...selection
}: { packageId?: string } & Selection) {
  const cart = useCart();
  const { session } = useSession();
  if (!session) return <Loading />;
  const storageKey =
    "travelbuddy:checkout:" +
    session.user.id +
    ":" +
    JSON.stringify(packageId ? [packageId, selection] : cart.items);
  return (
    <CheckoutContent
      key={storageKey}
      storageKey={storageKey}
      packageId={packageId}
      selection={selection}
    />
  );
}
function CheckoutContent({
  storageKey,
  packageId,
  selection,
}: {
  storageKey: string;
  packageId?: string;
  selection: Selection;
}) {
  const cart = useCart();
  const account = useQuery(accountQuery());
  const [attempt, setAttempt] = useState(() =>
    readAttempt(storageKey, sessionStorage),
  );
  // Retain the exact contact details when recovering a request with an unknown outcome.
  const [contact] = useState(() => {
    try {
      return JSON.parse(attempt.fingerprint ?? "null") as {
        travelerName: string;
        travelerEmail: string;
      } | null;
    } catch {
      return null;
    }
  });
  const items: CartItem[] = packageId
    ? [
        {
          id: attempt.item,
          experienceId: packageId,
          ...selection,
          date: selection.date ?? "",
          time: selection.time ?? "",
        },
      ]
    : cart.items;
  const packages = useQueries({
    queries: items.map((item) => packageQuery(item.experienceId)),
  });
  const [review, setReview] = useState<ReviewedItem[] | null>(null);
  const [details, setDetails] = useState<{
    travelerName: string;
    travelerEmail: string;
  } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const submitted = useRef(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  async function startReview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitted.current) return;
    submitted.current = true;
    setPending(true);
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const contact = {
      travelerName: String(form.get("name")).trim(),
      travelerEmail: String(form.get("email")).trim(),
    };
    try {
      const current = await Promise.all(
        items.map(async (item) => ({
          ...item,
          experience: await client.fetchQuery({
            ...packageQuery(item.experienceId),
            staleTime: 0,
          }),
        })),
      );
      const fingerprint = JSON.stringify({ ...contact, items });
      // A lost response may already have reserved the last places. Its exact retry
      // must reach the server's idempotency lookup rather than fail a fresh check.
      if (attempt.fingerprint !== fingerprint) {
        const availability = await Promise.all(
          items.map(
            (item) =>
              rpc("availability", {
                package_id: item.experienceId,
                day: item.date,
                option_index: item.option,
                travelers: item.travelers,
              }) as unknown as Promise<Availability>,
          ),
        );
        checkCapacity(current, availability);
      }
      setDetails(contact);
      setReview(current);
      setAccepted(false);
    } catch (error) {
      setError(error);
    } finally {
      submitted.current = false;
      setPending(false);
    }
  }
  async function confirm() {
    if (submitted.current || !review || !details || !accepted) return;
    submitted.current = true;
    setPending(true);
    setError(undefined);
    try {
      const payload = { ...details, items };
      const current = saveAttempt(
        storageKey,
        attempt,
        JSON.stringify(payload),
        sessionStorage,
      );
      setAttempt(current);
      const bookings = (await rpc("checkout", {
        input: { idempotencyKey: current.key, ...payload },
      })) as unknown as Booking[];
      if (!bookings.length)
        throw new Error(
          "No booking confirmation was returned. Retry this confirmation.",
        );
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* A confirmed order remains safe to replay. */
      }
      void client.invalidateQueries({ queryKey: ["bookings"] });
      void client.invalidateQueries({ queryKey: ["availability"] });
      await navigate({
        to: "/confirmation/$id",
        params: { id: bookings[0].id },
      });
      // Clear only after navigation so checkout never flashes an empty cart.
      if (!packageId) cart.remove(items.map((item) => item.id));
    } catch (error) {
      setError(error);
      submitted.current = false;
      setPending(false);
    }
  }
  if (!items.length)
    return (
      <section className="flex flex-col gap-5">
        <NoResults
          title="Choose an experience first"
          description="Your cart is empty. Add a date and time to start a booking."
        />
        <Link to="/search" search={{}} className={buttonVariants()}>
          Explore experiences
        </Link>
      </section>
    );
  if (account.isPending || packages.some((query) => query.isPending))
    return <Loading />;
  const loadError =
    account.error ?? packages.find((query) => query.error)?.error;
  if (loadError)
    return (
      <section className="flex flex-col gap-5">
        <Problem error={loadError} />
        <Link to="/cart">
          Return to your cart to edit or remove unavailable experiences
        </Link>
      </section>
    );
  if (items.some((item) => !item.date || !item.time))
    return (
      <Problem error={new Error("Choose a date and time before checkout.")} />
    );
  const preview =
    review ??
    items.map((item, index) => ({
      ...item,
      experience: packages[index].data!,
    }));
  const validOptions = preview.every(
    (item) => item.experience.options[item.option],
  );
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link to="/cart" className="text-primary">
        Back to your cart
      </Link>
      <div>
        <h1>{review ? "One last look." : "Who’s coming along?"}</h1>
        <p className="mt-3 text-muted-foreground">
          {review
            ? "Review the current prices, dates and policies before confirming."
            : "Add the lead traveler’s details for your bookings."}
        </p>
      </div>
      <CartStorageNotice />
      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              {review ? "Review and confirm" : "Lead traveler"}
            </CardTitle>
            <CardDescription>
              No payment is collected online. Places are reserved when you
              confirm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!review ? (
              <form onSubmit={startReview} className="flex flex-col gap-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="name">Full name</FieldLabel>
                    <Input
                      name="name"
                      id="name"
                      defaultValue={
                        details?.travelerName ??
                        contact?.travelerName ??
                        account.data?.displayName
                      }
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="name"
                      disabled={pending}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="email">Email address</FieldLabel>
                    <Input
                      name="email"
                      id="email"
                      type="email"
                      defaultValue={
                        details?.travelerEmail ??
                        contact?.travelerEmail ??
                        account.data?.email
                      }
                      required
                      maxLength={320}
                      autoComplete="email"
                      disabled={pending}
                    />
                  </Field>
                </FieldGroup>
                {error !== undefined && <Problem error={error} />}
                <Button type="submit" disabled={pending}>
                  {pending
                    ? "Checking prices and availability…"
                    : "Review booking"}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-5">
                <p>
                  {details!.travelerName}
                  <br />
                  {details!.travelerEmail}
                </p>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setReview(null);
                    setError(undefined);
                  }}
                >
                  Edit details
                </Button>
                <div className="flex flex-col gap-6">
                  {review.map((item) => (
                    <BookingSummary key={item.id} item={item} />
                  ))}
                </div>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="policies"
                      checked={accepted}
                      onCheckedChange={setAccepted}
                      disabled={pending}
                    />
                    <FieldLabel htmlFor="policies">
                      I have reviewed and accept the cancellation policies for
                      every booking.
                    </FieldLabel>
                  </Field>
                </FieldGroup>
                {error !== undefined && <Problem error={error} />}
                <Button
                  disabled={pending || !accepted}
                  onClick={() => void confirm()}
                >
                  {pending
                    ? "Confirming…"
                    : `Confirm ${review.length === 1 ? "booking" : "bookings"} · ${money(cartTotal(review))}`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your experiences</CardTitle>
            <CardDescription>
              All start times use Sri Lanka time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {preview.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <strong>{item.experience.title}</strong>
                <p>
                  {item.date} at {item.time} · {item.travelers} travelers
                </p>
                <p>
                  {item.experience.options[item.option]?.name ??
                    "Option no longer available"}
                </p>
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <span>Total · USD</span>
            <strong>
              {validOptions
                ? money(cartTotal(preview))
                : "Choose another option"}
            </strong>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
