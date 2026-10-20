import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  MapPin,
  Clock,
  Star,
  Check,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
import { packageQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { today, money, type Selection } from "@/lib/validation";
import type { Availability } from "./types";
import { useSession } from "@/features/auth/session";
import { Media } from "./media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading } from "@/components/feedback";
export function ExperiencePage({
  id,
  initial,
}: {
  id: string;
  initial: Selection;
}) {
  const detail = useQuery(packageQuery(id));
  const client = useQueryClient();
  const [selection, setSelection] = useState(initial);
  const [cartPending, setCartPending] = useState(false);
  const [cartError, setCartError] = useState<unknown>();
  const navigate = useNavigate();
  const { session } = useSession();
  const availability = useQuery({
    queryKey: ["availability", id, selection],
    enabled: !!detail.data,
    queryFn: async () => {
      const args = {
        package_id: id,
        day: selection.date ?? today(),
        option_index: selection.option,
        travelers: selection.travelers,
      };
      let result = (await rpc("availability", args)) as unknown as Availability;
      if (!selection.date && result.next && result.next.date !== args.day)
        result = (await rpc("availability", {
          ...args,
          day: result.next.date,
        })) as unknown as Availability;
      return result;
    },
    staleTime: 15000,
  });
  if (detail.isPending) return <Loading />;
  if (detail.error) return <Problem error={detail.error} />;
  const p = detail.data;
  const a = availability.data;
  const date = selection.date ?? a?.next?.date ?? today();
  const slots =
    a?.slots.filter((s) => s.remaining >= selection.travelers) ?? [];
  const time = slots.some((s) => s.time === selection.time)
    ? selection.time
    : slots[0]?.time;
  const chosen = { ...selection, date, time };
  const back =
    "/experience/" +
    encodeURIComponent(id) +
    "?" +
    new URLSearchParams({
      ...chosen,
      option: String(chosen.option),
      travelers: String(chosen.travelers),
      time: time ?? "",
    }).toString();
  function book() {
    if (!time) return;
    navigate({ to: "/checkout", search: { packageId: id, ...chosen, time } });
  }
  async function addToCart() {
    if (!time) return;
    if (!session) {
      await navigate({ to: "/login", search: { returnTo: back } });
      return;
    }
    setCartPending(true);
    setCartError(undefined);
    try {
      await rpc("cart_add", {
        package_id: id,
        booking_date: date,
        start_time: time,
        option_index: chosen.option,
        travelers: chosen.travelers,
      });
      await client.invalidateQueries({ queryKey: ["cart"] });
      await navigate({ to: "/cart" });
    } catch (e) {
      setCartError(e);
    } finally {
      setCartPending(false);
    }
  }
  return (
    <article>
      <Link
        to="/search"
        search={{}}
        className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
      >
        Explore experiences
      </Link>
      <div className="mb-6 [&_h1]:my-4 [&_h1]:max-w-4xl">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground [&_svg]:size-4">
            <MapPin />
            {p.destination}, {p.country}
          </p>
          <h1>{p.title}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm [&_svg]:size-4 [&_svg]:fill-primary [&_svg]:text-primary [&_span]:text-muted-foreground">
            <Star />
            {p.rating} <span>({p.reviews} reviews)</span>
            <span>Hosted by {p.supplier}</span>
          </p>
        </div>
      </div>
      <div className="my-6 flex h-64 gap-3 overflow-hidden rounded-xl sm:h-[400px] [&>img]:object-cover [&>img:first-child]:min-w-0 [&>img:first-child]:flex-1 [&>img:not(:first-child)]:hidden [&>img:not(:first-child)]:w-1/4 sm:[&>img:not(:first-child)]:block">
        <Media src={p.image} alt={p.title} />
        {p.gallery
          .filter((g) => g !== p.image)
          .slice(0, 2)
          .map((g, i) => (
            <Media
              key={i}
              src={g}
              alt={`${p.destination} experience view ${i + 2}`}
            />
          ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <div className="flex flex-col gap-8 [&_section]:flex [&_section]:flex-col [&_section]:gap-4 [&_section>p]:leading-relaxed [&_section>p]:text-muted-foreground">
          <div className="flex flex-wrap gap-4 rounded-lg border bg-card p-5 text-sm [&_span]:flex [&_span]:items-center [&_span]:gap-2 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
            <span>
              <Clock />
              {p.duration}
            </span>
            <span>{p.languages.join(", ")}</span>
            {p.freeCancellation && (
              <span>
                <Check />
                Free cancellation up to 24 hours before
              </span>
            )}
          </div>
          <section>
            <h2>A closer look</h2>
            <p>{p.description}</p>
          </section>
          <section>
            <h2>What makes it special</h2>
            <ul className="flex flex-col gap-3 [&_li]:flex [&_li]:items-start [&_li]:gap-3 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
              {p.highlights.map((h) => (
                <li key={h}>
                  <Check />
                  {h}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Included in your experience</h2>
            <ul className="flex flex-col gap-3 [&_li]:flex [&_li]:items-start [&_li]:gap-3 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
              {p.included.map((h) => (
                <li key={h}>
                  <Check />
                  {h}
                </li>
              ))}
            </ul>
            {p.notIncluded.length > 0 && (
              <p className="text-muted-foreground mt-4">
                Not included: {p.notIncluded.join(", ")}.
              </p>
            )}
          </section>
          <section>
            <h2>Your journey</h2>
            <ol className="flex flex-col gap-6 border-l-2 pl-5 [&_li]:flex [&_li]:gap-5 [&_li>span]:w-20 [&_li>span]:shrink-0 [&_li>span]:text-sm [&_li>span]:text-primary [&_h3]:mb-2 [&_p]:text-muted-foreground">
              {p.itinerary.map((s, i) => (
                <li key={i}>
                  <span>{s.time}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2>Where you’ll meet</h2>
            <p>{p.meetingPoint}</p>
          </section>
        </div>
        <Card className="row-start-1 self-start lg:sticky lg:top-24 lg:row-auto">
          <CardHeader>
            <p>
              From{" "}
              <strong>
                {money(p.options[selection.option]?.price ?? p.price)}
              </strong>{" "}
              / person
            </p>
            <CardTitle>Choose your date and travelers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="option">Experience option</FieldLabel>
                <NativeSelect
                  id="option"
                  value={selection.option}
                  onChange={(e) =>
                    setSelection({
                      ...selection,
                      option: Number(e.target.value),
                      time: undefined,
                    })
                  }
                >
                  {p.options.map((o, i) => (
                    <NativeSelectOption key={i} value={i}>
                      {o.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="date">Date</FieldLabel>
                  <Input
                    id="date"
                    type="date"
                    min={today()}
                    value={date}
                    onChange={(e) =>
                      setSelection({
                        ...selection,
                        date: e.target.value,
                        time: undefined,
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="travelers">Travelers</FieldLabel>
                  <Input
                    id="travelers"
                    type="number"
                    min="1"
                    max="12"
                    value={selection.travelers}
                    onChange={(e) =>
                      setSelection({
                        ...selection,
                        travelers: Math.max(
                          1,
                          Math.min(12, Number(e.target.value)),
                        ),
                        time: undefined,
                      })
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="time">
                  Start time · Sri Lanka time
                </FieldLabel>
                <NativeSelect
                  id="time"
                  value={time ?? ""}
                  onChange={(e) =>
                    setSelection({ ...selection, time: e.target.value })
                  }
                >
                  <NativeSelectOption value="" disabled>
                    {availability.isPending
                      ? "Checking times…"
                      : "Choose a time"}
                  </NativeSelectOption>
                  {slots.map((s) => (
                    <NativeSelectOption key={s.time} value={s.time}>
                      {s.time} · {s.remaining} places left
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </FieldGroup>
            {availability.error && <Problem error={availability.error} />}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            {cartError !== undefined && <Problem error={cartError} />}
            <Button
              size="lg"
              disabled={!time || availability.isPending || !!availability.error}
              onClick={book}
            >
              Book Now
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={!time || availability.isPending || !!availability.error || cartPending}
              onClick={() => void addToCart()}
            >
              {cartPending ? "Adding…" : "Add to cart"}
            </Button>
            {!availability.isPending && !slots.length && (
              <p role="status">
                {a?.next ? (
                  <Button
                    variant="link"
                    onClick={() =>
                      setSelection({
                        ...selection,
                        date: a.next!.date,
                        time: a.next!.time,
                      })
                    }
                  >
                    Next available: {a.next.date} at {a.next.time}
                  </Button>
                ) : (
                  "No available dates for this selection."
                )}
              </p>
            )}
            <Button
              variant="outline"
              disabled={!p.canChat}
              onClick={() =>
                session
                  ? navigate({
                      to: "/inbox",
                      search: { packageId: id, returnTo: back },
                    })
                  : navigate({ to: "/login", search: { returnTo: back } })
              }
            >
              <MessageCircle data-icon="inline-start" />
              {p.canChat ? "Chat with provider" : "Provider chat unavailable"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Ask your host a question before confirming. Your selection stays
              with you.
            </p>
          </CardFooter>
        </Card>
      </div>
    </article>
  );
}
