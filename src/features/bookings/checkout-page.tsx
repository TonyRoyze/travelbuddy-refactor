import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { accountQuery, cartQuery, packageQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { money, type Selection } from "@/lib/validation";
import type { Booking } from "./types";
import { readAttempt, saveAttempt } from "./attempt";
import { Media } from "@/features/catalog/media";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading } from "@/components/feedback";

type CheckoutProps =
  | { cart: true }
  | ({ cart?: false; packageId: string } & Selection);

export function CheckoutPage(props: CheckoutProps) {
  const cartMode = props.cart === true;
  const packageId = cartMode ? undefined : props.packageId;
  const selection = cartMode ? undefined : props;
  const pack = useQuery({
    ...packageQuery(packageId ?? ""),
    enabled: !cartMode,
  });
  const cart = useQuery({ ...cartQuery(), enabled: cartMode });
  const account = useQuery(accountQuery());
  const storageKey = cartMode
    ? "travelbuddy:checkout:cart"
    : "travelbuddy:checkout:" +
      JSON.stringify([
        packageId,
        selection?.date,
        selection?.time,
        selection?.option,
        selection?.travelers,
      ]);
  const [attempt, setAttempt] = useState(() =>
    readAttempt(storageKey, sessionStorage),
  );
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const travelerName = String(f.get("name")).trim();
    const travelerEmail = String(f.get("email")).trim();
    const cartItems = cart.data?.items ?? [];
    const selectedItems = cartMode
      ? cartItems.map((item) => ({
          id: item.id,
          experienceId: item.experienceId,
          option: item.option,
          date: item.date,
          time: item.time,
          travelers: item.travelers,
        }))
      : [
          {
            id: attempt.item,
            experienceId: packageId!,
            option: selection!.option,
            date: selection!.date,
            time: selection!.time,
            travelers: selection!.travelers,
          },
        ];
    const details = { travelerName, travelerEmail, items: selectedItems };
    const fingerprint = JSON.stringify(details);
    setPending(true);
    setError(undefined);
    try {
      const current = saveAttempt(
        storageKey,
        attempt,
        fingerprint,
        sessionStorage,
      );
      setAttempt(current);
      const bookings = (await (cartMode
        ? rpc("checkout_cart", {
            input: {
              idempotencyKey: current.key,
              travelerName,
              travelerEmail,
            },
          })
        : rpc("checkout", {
            input: {
              idempotencyKey: current.key,
              travelerName,
              travelerEmail,
              items: selectedItems,
            },
          }))) as unknown as Booking[];
      sessionStorage.removeItem(storageKey);
      await client.invalidateQueries({ queryKey: ["bookings"] });
      if (cartMode) await client.invalidateQueries({ queryKey: ["cart"] });
      await navigate({
        to: "/confirmation/$id",
        params: { id: bookings[0].id },
        search: { orderId: bookings[0].orderId },
      });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  if (account.isPending || (cartMode ? cart.isPending : pack.isPending))
    return <Loading />;
  if (account.error || (cartMode ? cart.error : pack.error))
    return <Problem error={account.error ?? cart.error ?? pack.error} />;
  if (cartMode && !cart.data?.items.length)
    return (
      <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-6">
        <h1>Your cart is empty</h1>
        <p className="text-muted-foreground">
          Add an experience before continuing to checkout.
        </p>
        <Link to="/cart" className={buttonVariants()}>
          Back to cart
        </Link>
      </section>
    );
  if (!cartMode && (!selection?.date || !selection?.time))
    return (
      <Problem
        error={
          new Error(
            "Choose a date and time on the experience page before checkout.",
          )
        }
      />
    );

  const experience = pack.data;
  const cartItems = cart.data?.items ?? [];
  const unavailable = cartItems.some((item) => !item.available);
  const directOption = experience?.options[selection?.option ?? 0];
  const total = cartMode
    ? (cart.data?.total ?? 0)
    : (directOption?.price ?? 0) * (selection?.travelers ?? 1);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12 [&>section]:flex [&>section]:flex-col [&>section]:gap-5 [&>section]:rounded-xl [&>section]:border [&>section]:bg-card [&>section]:p-6 md:[&>section]:p-8">
      <section>
        {cartMode ? (
          <Link to="/cart">Back to cart</Link>
        ) : (
          <Link
            to="/experience/$id"
            params={{ id: packageId! }}
            search={selection!}
          >
            Back to experience
          </Link>
        )}
        <h1>One step closer.</h1>
        <p className="mb-8 text-muted-foreground">
          Confirm your details and reserve your place.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Traveler name</FieldLabel>
              <Input
                name="name"
                id="name"
                defaultValue={account.data?.displayName}
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <Input
                name="email"
                id="email"
                type="email"
                defaultValue={account.data?.email}
                required
                maxLength={320}
                autoComplete="email"
              />
            </Field>
          </FieldGroup>
          {error !== undefined && <Problem error={error} />}
          {unavailable && (
            <Problem
              error={new Error("Remove unavailable cart items before checkout.")}
            />
          )}
          <p className="text-muted-foreground">
            This confirms your reservation. No payment is collected.
          </p>
          <Button type="submit" size="lg" disabled={pending || unavailable}>
            {pending ? "Confirming…" : "Confirm reservation"}
          </Button>
        </form>
      </section>
      <aside className="flex flex-col gap-4 rounded-xl border bg-card p-6 lg:sticky lg:top-24 lg:self-start">
        <h2>Order summary</h2>
        {cartMode
          ? cartItems.map((item) => (
              <div key={item.id} className="flex gap-3 border-b pb-3 last:border-0">
                <Media
                  src={item.experience.image}
                  alt={item.experience.title}
                  className="size-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <p className="font-medium">{item.experience.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.date} at {item.time} · {item.travelers} traveler
                    {item.travelers === 1 ? "" : "s"}
                  </p>
                  <p className="text-sm">{money(item.lineTotal)}</p>
                </div>
              </div>
            ))
          : experience && (
              <>
                <Media src={experience.image} alt={experience.title} />
                <h3>{experience.title}</h3>
                <p>{directOption?.name}</p>
                <p>
                  {selection?.date} at {selection?.time} · Sri Lanka time
                </p>
                <p>
                  {selection?.travelers} traveler
                  {selection?.travelers === 1 ? "" : "s"}
                </p>
              </>
            )}
        <p className="flex items-center justify-between border-t pt-5 text-xl [&_strong]:text-foreground">
          Total <strong>{money(total)}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Availability and total are checked again when you confirm.
        </p>
      </aside>
    </div>
  );
}
