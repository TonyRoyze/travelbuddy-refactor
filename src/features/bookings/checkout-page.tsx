import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { accountQuery, packageQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { money, type Selection } from "@/lib/validation";
import type { Booking } from "./types";
import { readAttempt, saveAttempt } from "./attempt";
import { Media } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading } from "@/components/feedback";
export function CheckoutPage({
  packageId,
  ...selection
}: { packageId: string } & Selection) {
  const pack = useQuery(packageQuery(packageId));
  const account = useQuery(accountQuery());
  const storageKey =
    "travelbuddy:checkout:" +
    JSON.stringify([
      packageId,
      selection.date,
      selection.time,
      selection.option,
      selection.travelers,
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
    const details = {
      travelerName: String(f.get("name")).trim(),
      travelerEmail: String(f.get("email")).trim(),
      items: [{ id: attempt.item, experienceId: packageId, ...selection }],
    };
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
      const bookings = (await rpc("checkout", {
        input: { idempotencyKey: current.key, ...details },
      })) as unknown as Booking[];
      sessionStorage.removeItem(storageKey);
      await client.invalidateQueries({ queryKey: ["bookings"] });
      await navigate({
        to: "/confirmation/$id",
        params: { id: bookings[0].id },
      });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  if (pack.isPending || account.isPending) return <Loading />;
  if (pack.error || account.error)
    return <Problem error={pack.error ?? account.error} />;
  const p = pack.data;
  if (!selection.date || !selection.time)
    return (
      <Problem
        error={
          new Error(
            "Choose a date and time on the experience page before checkout.",
          )
        }
      />
    );
  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12 [&>section]:flex [&>section]:flex-col [&>section]:gap-5 [&>section]:rounded-xl [&>section]:border [&>section]:bg-card [&>section]:p-6 md:[&>section]:p-8">
      <section>
        <Link
          to="/experience/$id"
          params={{ id: packageId }}
          search={selection}
        >
          Back to experience
        </Link>
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
          <p className="text-muted-foreground">
            This confirms your reservation. No payment is collected.
          </p>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Confirming…" : "Confirm reservation"}
          </Button>
        </form>
      </section>
      <aside className="flex flex-col gap-4 rounded-xl border bg-card p-6 lg:sticky lg:top-24 lg:self-start [&>img]:aspect-video [&>img]:w-full [&>img]:rounded-lg [&>img]:object-cover [&>p]:text-muted-foreground">
        <Media src={p.image} alt={p.title} />
        <h2>{p.title}</h2>
        <p>{p.options[selection.option]?.name}</p>
        <p>
          {selection.date} at {selection.time} · Sri Lanka time
        </p>
        <p>
          {selection.travelers} traveler{selection.travelers === 1 ? "" : "s"}
        </p>
        <p className="flex items-center justify-between border-t pt-5 text-xl [&_strong]:text-foreground">
          Total{" "}
          <strong>
            {money(
              (p.options[selection.option]?.price ?? 0) * selection.travelers,
            )}
          </strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Availability and total are checked again when you confirm.
        </p>
      </aside>
    </div>
  );
}
