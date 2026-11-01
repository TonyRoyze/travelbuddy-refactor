import { useMoney } from "@/features/currency/currency-provider";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useRef, useState } from "react";
import { BookingPolicy } from "@/features/bookings/policy";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  MapPin,
  Clock,
  Star,
  CheckCircle2,
  XCircle,
  MessageCircle,
  ArrowRight,
  ShieldCheck,
  Languages,
  ChevronRight,
  Zap,
} from "lucide-react";
import { packageQuery } from "@/lib/queries";
import { useLiveNowUpdates } from "@/lib/live-now";
import { rpc } from "@/lib/supabase";
import { today, type Selection } from "@/lib/validation";
import type { Availability } from "./types";
import { useSession } from "@/features/auth/session";
import { VideoMedia } from "./media";
import { PhotoGallery } from "./photo-gallery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectCombobox } from "@/components/custom-ui/select-combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { addDays } from "./selection";
import { useCart } from "@/features/bookings/cart-provider";
import { CartStorageNotice } from "@/features/bookings/cart-page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Problem, Loading } from "@/components/custom-ui/feedback";
import { Badge } from "@/components/ui/badge";
import { ExperienceReviews } from "@/features/reviews/reviews";

export function ExperiencePage({
  id,
  initial,
}: {
  id: string;
  initial: Selection & { item?: string };
}) {
  useLiveNowUpdates();
  const money = useMoney();
  const detail = useQuery(packageQuery(id));
  const [selection, setSelection] = useState<Selection>(() => ({
    ...initial,
    date:
      initial.date &&
      initial.date >= today() &&
      initial.date <= addDays(today(), 180)
        ? initial.date
        : undefined,
  }));
  const cart = useCart();
  const editing = cart.items.find(
    (item) => item.id === initial.item && item.experienceId === id,
  );
  const [cartNotice, setCartNotice] = useState("");
  const [cartError, setCartError] = useState<unknown>();
  const saving = useRef(false);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const { session } = useSession();

  const availability = useQuery({
    queryKey: [
      "availability",
      id,
      selection.date,
      selection.option,
      selection.travelers,
    ],
    enabled: !!detail.data,
    queryFn: async () => {
      const args = {
        package_id: id,
        day: selection.date ?? today(),
        option_index: detail.data?.options[selection.option]
          ? selection.option
          : 0,
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
    staleTime: 0,
    refetchInterval: 15000,
  });

  if (detail.isPending) return <Loading />;
  if (detail.error) return <Problem error={detail.error} />;

  const p = detail.data;
  const a = availability.data;
  const date = selection.date ?? a?.date ?? today();
  const option = p.options[selection.option] ? selection.option : 0;
  const slots =
    a?.slots.filter((s) => s.remaining >= selection.travelers) ?? [];
  const time = slots.some((s) => s.time === selection.time)
    ? selection.time
    : slots[0]?.time;
  const chosen = { option, travelers: selection.travelers, date, time };
  const back =
    "/experience/" +
    encodeURIComponent(id) +
    "?" +
    new URLSearchParams({
      ...chosen,
      ...(editing ? { item: editing.id } : {}),
      option: String(chosen.option),
      travelers: String(chosen.travelers),
      time: time ?? "",
    }).toString();

  async function book(checkout = true) {
    if (!time || saving.current) return;
    if (!session) {
      await navigate({ to: "/login", search: { returnTo: back } });
      return;
    }
    saving.current = true;
    setAdding(true);
    setCartError(undefined);
    setCartNotice("");
    try {
      cart.put({
        id: editing?.id ?? crypto.randomUUID(),
        experienceId: id,
        ...chosen,
        time,
      });
      if (checkout || editing)
        await navigate({ to: checkout ? "/checkout" : "/cart", search: {} });
      else
        setCartNotice(
          "Added to your cart. Places are reserved only after checkout confirmation.",
        );
    } catch (error) {
      setCartError(error);
    } finally {
      saving.current = false;
      setAdding(false);
    }
  }

  return (
    <article className="flex flex-col gap-6 max-w-[1340px] mx-auto pb-16">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link to="/" className="hover:text-primary transition-colors">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/search" search={{ country: "Sri Lanka" }} className="hover:text-primary transition-colors">
          Sri Lanka
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/search" search={{ destination: p.destination }} className="hover:text-primary transition-colors">
          {p.destination}
        </Link>
        <ChevronRight className="size-3" />
        <span className="truncate max-w-[240px] sm:max-w-md text-foreground font-semibold">
          {p.title}
        </span>
      </nav>

      {/* Experience Header / Title & Badges */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {p.liveNow && (
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
              <span className="size-1.5 rounded-full bg-white animate-pulse" />
              Live Now
            </Badge>
          )}
          {p.freeCancellation && (
            <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 gap-1 font-semibold">
              <CheckCircle2 className="size-3" />
              Free Cancellation
            </Badge>
          )}
          <Badge variant="secondary" className="font-medium">
            {p.category}
          </Badge>
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground leading-[1.15]">
          {p.title}
        </h1>

        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs sm:text-sm text-foreground">
          <div className="flex items-center gap-1 font-bold">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            <span>{p.rating.toFixed(1)}</span>
            <span className="font-normal text-muted-foreground">
              ({p.reviews} verified reviews)
            </span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-4 text-primary shrink-0" />
            <span>{p.destination}, {p.country}</span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <div className="text-muted-foreground">
            Hosted by{" "}
            {p.providerId ? (
              <Link
                to="/buddy/$id"
                params={{ id: p.providerId }}
                className="text-primary font-semibold hover:underline"
              >
                {p.supplier}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{p.supplier}</span>
            )}
          </div>
        </div>
      </div>

      {/* Photo Gallery full-width */}
      <div className="rounded-2xl overflow-hidden shadow-xs border border-border/80">
        <PhotoGallery images={[p.image, ...p.gallery]} title={p.title} />
      </div>

      {/* Main Content Layout: Story Left, Booking Box Right */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 mt-4 items-start">
        {/* Left Column: Details, Highlights, Itinerary, Reviews */}
        <div className="flex flex-col gap-10">
          {/* Quick Info Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl border border-border/80 bg-card shadow-xs">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Clock className="size-4 text-primary" /> Duration
              </span>
              <strong className="text-sm font-semibold">{p.duration}</strong>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Languages className="size-4 text-primary" /> Language
              </span>
              <strong className="text-sm font-semibold truncate">
                {p.languages.join(", ")}
              </strong>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Zap className="size-4 text-primary" /> Confirmation
              </span>
              <strong className="text-sm font-semibold">Instant Ticket</strong>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <ShieldCheck className="size-4 text-primary" /> Cancellation
              </span>
              <strong className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {p.freeCancellation ? "Up to 24h free" : "Standard policy"}
              </strong>
            </div>
          </div>

          {/* Video Preview if available */}
          {!!p.videoIds?.length && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Experience Preview Video
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {p.videoIds.map((id, index) => (
                  <VideoMedia
                    key={id}
                    id={id}
                    title={`Experience video ${index + 1}`}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Overview Section */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Overview
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              {p.description}
            </p>
          </section>

          {/* What makes it special / Highlights */}
          <section className="flex flex-col gap-4 p-6 rounded-2xl bg-muted/30 border border-border/80">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              What Makes It Special
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {p.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <span className="leading-snug">{h}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* What's Included & Excluded */}
          <section className="flex flex-col gap-6">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              What's Included & Excluded
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  Included
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {p.included.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {p.notIncluded.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wide">
                    Not Included
                  </h3>
                  <ul className="flex flex-col gap-2.5">
                    {p.notIncluded.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <XCircle className="size-4 shrink-0 text-neutral-400 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Itinerary Timeline */}
          {p.itinerary?.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                What You'll Do (Itinerary)
              </h2>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {p.itinerary.map((s, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-xs">
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-primary">{s.time}</span>
                        <h3 className="text-base font-bold text-foreground">{s.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Meeting Point */}
          <section className="flex flex-col gap-3 p-6 rounded-2xl border border-border/80 bg-card">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <MapPin className="size-5 text-primary" /> Departure & Meeting Point
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {p.meetingPoint}
            </p>
          </section>

          {/* Verified Customer Reviews */}
          <section className="flex flex-col gap-4">
            <ExperienceReviews packageId={p.id} />
          </section>

          {/* Things to Know & Policies */}
          <section className="flex flex-col gap-4 border-t border-border pt-8">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Things to Know Before You Book
            </h2>
            <BookingPolicy experience={p} date={date} time={time} />
          </section>
        </div>

        {/* Right Column: Sticky Booking Widget (Viator Style) */}
        <aside className="sticky top-24 z-20">
          <Card
            id="booking"
            className="border border-border/80 bg-card shadow-lg rounded-2xl overflow-hidden"
          >
            <CardHeader className="bg-muted/30 border-b border-border/80 pb-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">From</span>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-2xl font-extrabold text-foreground">
                      {money(
                        p.options[option]?.price ?? p.price,
                        p.currency ?? "LKR",
                      )}
                    </strong>
                    <span className="text-xs text-muted-foreground">/ person</span>
                  </div>
                </div>
                {p.freeCancellation && (
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                    Free Cancellation
                  </span>
                )}
              </div>
              <CardTitle className="text-sm font-semibold text-muted-foreground mt-2">
                Select Date, Option & Travelers
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 pt-5">
              <FieldGroup>
                {/* Option selector */}
                <Field>
                  <FieldLabel htmlFor="option">Option / Tour Type</FieldLabel>
                  <SelectCombobox
                    id="option"
                    value={String(option)}
                    onValueChange={(value) =>
                      setSelection({
                        ...selection,
                        option: Number(value),
                        time: undefined,
                      })
                    }
                    options={p.options.map((o, i) => ({
                      value: String(i),
                      label: `${o.name} (${money(o.price, p.currency ?? "LKR")})`,
                    }))}
                  />
                </Field>

                {/* Date & Travelers Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="date">Date</FieldLabel>
                    <Input
                      id="date"
                      type="date"
                      min={today()}
                      max={addDays(today(), 180)}
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
                            Math.min(12, Math.floor(Number(e.target.value)) || 1),
                          ),
                          time: undefined,
                        })
                      }
                    />
                  </Field>
                </div>

                {/* Time slot selector */}
                <Field>
                  <FieldLabel htmlFor="time">
                    Available Departure Time
                  </FieldLabel>
                  <SelectCombobox
                    id="time"
                    value={time ?? ""}
                    placeholder={
                      availability.isPending ? "Checking times…" : "Choose a time"
                    }
                    onValueChange={(value) =>
                      setSelection({ ...selection, time: value })
                    }
                    options={slots.map((s) => ({
                      value: s.time,
                      label: `${s.time} · ${s.remaining} spot${s.remaining === 1 ? "" : "s"} left`,
                    }))}
                  />
                </Field>
              </FieldGroup>

              {availability.error && <Problem error={availability.error} />}

              {!selection.date && date > today() && (
                <Alert className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 text-xs">
                  <AlertDescription>
                    No slots remain for today. Automatically switched to next available date.
                  </AlertDescription>
                </Alert>
              )}

              {/* Total Calculation */}
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-sm font-semibold border border-border/60">
                <span className="text-muted-foreground">
                  Total for {selection.travelers} traveler{selection.travelers === 1 ? "" : "s"}
                </span>
                <strong className="text-lg font-bold text-foreground">
                  {money(
                    (Math.round((p.options[option]?.price ?? 0) * 100) *
                      selection.travelers) /
                      100,
                    p.currency ?? "LKR"
                  )}
                </strong>
              </div>

              <CartStorageNotice />
              {cartError !== undefined && <Problem error={cartError} />}
              {cartNotice && (
                <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  {cartNotice}
                </p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-2.5 pt-0 pb-6">
              <Button
                size="lg"
                className="w-full text-base font-bold shadow-sm"
                disabled={
                  !time ||
                  availability.isPending ||
                  !!availability.error ||
                  adding
                }
                onClick={() => void book(true)}
              >
                Reserve Now
                <ArrowRight className="size-4" />
              </Button>

              <Button
                variant="outline"
                className="w-full font-semibold"
                disabled={
                  !time ||
                  availability.isPending ||
                  !!availability.error ||
                  adding
                }
                onClick={() => void book(false)}
              >
                {editing ? "Update cart" : "Add to cart"}
              </Button>

              {!availability.isPending && !slots.length && (
                <div role="status" className="text-xs text-center text-muted-foreground pt-1">
                  {a?.next ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-xs font-semibold text-primary"
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
                    "No spots available for the chosen date."
                  )}
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground mt-1"
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
                <MessageCircle className="size-3.5" />
                {p.canChat ? `Ask ${p.supplier} a question` : "Host chat currently unavailable"}
              </Button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground pt-2">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                <span>Reserve now & pay later eligible</span>
              </div>
            </CardFooter>
          </Card>
        </aside>
      </div>
    </article>
  );
}
