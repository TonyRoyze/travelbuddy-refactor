import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [selection, setSelection] = useState(initial);
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
  return (
    <article>
      <Link to="/search" search={{}} className="back-link">
        Explore experiences
      </Link>
      <div className="detail-heading">
        <div>
          <p className="location">
            <MapPin />
            {p.destination}, {p.country}
          </p>
          <h1>{p.title}</h1>
          <p className="rating">
            <Star />
            {p.rating} <span>({p.reviews} reviews)</span>
            <span>Hosted by {p.supplier}</span>
          </p>
        </div>
      </div>
      <div className="detail-gallery">
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
      <div className="detail-layout">
        <div className="detail-copy">
          <div className="detail-facts">
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
            <ul className="check-list">
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
            <ul className="check-list">
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
            <ol className="itinerary">
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
        <aside className="booking-panel">
          <p>
            From{" "}
            <strong>
              {money(p.options[selection.option]?.price ?? p.price)}
            </strong>{" "}
            / person
          </p>
          <h2>Make it a plan</h2>
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
                  {availability.isPending ? "Checking times…" : "Choose a time"}
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
          <Button
            size="lg"
            disabled={!time || availability.isPending || !!availability.error}
            onClick={book}
          >
            Book Now
            <ArrowRight data-icon="inline-end" />
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
        </aside>
      </div>
    </article>
  );
}
