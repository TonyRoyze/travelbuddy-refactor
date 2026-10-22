import { useMoney } from "@/features/currency/currency-provider";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  MapPin,
  ArrowRight,
  Compass,
  Utensils,
  Landmark,
  Sparkles,
  Trees,
  Waves,
} from "lucide-react";
import { catalogQuery } from "@/lib/queries";
import { useLiveNowUpdates } from "@/lib/live-now";
import { searchSchema, today } from "@/lib/validation";
import { CatalogSearchInput } from "./search-input";
import { addDays } from "./selection";
import { Switch } from "@/components/ui/switch";
import { Media } from "./media";
import { destinations } from "./destinations";
import { destinationSlug } from "./destination-links";
import { ExperienceCard } from "./experience-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Problem, Loading, NoResults } from "@/components/feedback";
const categories = [
  { name: "Tours & sightseeing", label: "Tours", icon: Landmark },
  { name: "Food & drink", label: "Food & drink", icon: Utensils },
  { name: "Tickets & passes", label: "Attractions", icon: Compass },
  { name: "Day trips", label: "Day trips", icon: Sparkles },
  { name: "Wildlife", label: "Wildlife", icon: Trees },
  { name: "Cruises & sailing", label: "Cruises & sailing", icon: Waves },
];
const container = "mx-auto w-full max-w-[1280px] px-4 md:px-8 xl:px-10";
export function CatalogPage({
  home = false,
  filters = {},
}: {
  home?: boolean;
  filters?: Record<string, unknown>;
}) {
  const money = useMoney();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState<unknown>();
  const parsed = searchSchema.parse(filters);
  const query = useQuery(
    catalogQuery(home ? { ...parsed, country: "Sri Lanka" } : parsed),
  );
  useLiveNowUpdates();
  const navigate = useNavigate();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = {
      ...parsed,
      q: String(f.get("q") ?? parsed.q),
      destination: String(f.get("destination") ?? parsed.destination),
      category: String(f.get("category") ?? parsed.category),
      date: f.has("date")
        ? String(f.get("date") || "") || undefined
        : parsed.date,
      duration: f.has("duration")
        ? String(f.get("duration") || "") || undefined
        : parsed.duration,
      minPrice: f.has("minPrice")
        ? f.get("minPrice")
          ? Number(f.get("minPrice"))
          : undefined
        : parsed.minPrice,
      maxPrice: f.has("maxPrice")
        ? f.get("maxPrice")
          ? Number(f.get("maxPrice"))
          : undefined
        : parsed.maxPrice,
      freeCancellation: f.get("filterForm")
        ? f.get("freeCancellation") === "on"
        : parsed.freeCancellation,
      sort: String(f.get("sort") ?? parsed.sort),
      page: 1,
    };
    if (
      next.minPrice !== undefined &&
      next.maxPrice !== undefined &&
      next.minPrice > next.maxPrice
    ) {
      setFilterError(new Error("Minimum price must not exceed maximum price."));
      return;
    }
    setFilterError(undefined);
    void navigate({ to: "/search", search: searchSchema.parse(next) });
  }
  const packages = query.data?.items ?? [];
  const featured = packages.find((p) => p.id === "colombo-food") ?? packages[0];
  const searchInput = (
    <CatalogSearchInput
      key={parsed.q}
      initial={parsed.q}
      onChoose={(item) =>
        void navigate({
          to: "/search",
          search: {
            ...parsed,
            q: item.kind === "category" ? "" : item.value.slice(0, 120),
            category: item.kind === "category" ? item.value : parsed.category,
            page: 1,
          },
        })
      }
    />
  );

  const resultGrid = query.isPending ? (
    <Loading />
  ) : query.error ? (
    <Problem error={query.error} />
  ) : !packages.length ? (
    <NoResults
      title="A different direction?"
      description="Try another destination or adjust your filters."
    />
  ) : (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-8 md:gap-6",
        home ? "lg:grid-cols-4" : "xl:grid-cols-3",
      )}
    >
      {(home ? packages.slice(0, 4) : packages).map((p) => (
        <ExperienceCard key={p.id} experience={p} date={parsed.date} />
      ))}
    </div>
  );
  if (home)
    return (
      <>
        <section className="relative isolate overflow-hidden bg-hero text-hero-foreground">
          <img
            className="absolute inset-0 -z-20 size-full object-cover object-[55%_50%]"
            src="https://images.unsplash.com/photo-1711100358840-ce6fd71c31b3?auto=format&fit=crop&w=2000&q=85"
            alt="Sigiriya and the green landscape of Sri Lanka"
          />
          <div className="absolute inset-0 -z-10 bg-linear-to-r from-hero/95 to-hero/65" />
          <div className={cn(container, "py-12 md:py-16")}>
            <p className="flex items-center gap-2 text-xs">
              <MapPin className="size-3.5" />
              Discover Sri Lanka
            </p>
            <h1 className="my-6 text-4xl leading-[1.05] tracking-[-.03em] sm:text-5xl lg:text-[64px]">
              Go somewhere
              <br />
              <span className="text-hero-accent">good.</span>
            </h1>
            <p className="text-base md:text-lg">
              Local experiences. Stories worth bringing home.
            </p>
            <form
              className="mt-6 max-w-[700px] text-foreground"
              onSubmit={submit}
            >
              {searchInput}
            </form>
          </div>
        </section>
        <div className={container}>
          <nav
            aria-label="Experience categories"
            className="flex gap-6 overflow-x-auto border-b py-6 md:justify-between md:gap-8"
          >
            {categories.map(({ icon: Icon, ...c }) => (
              <Link
                key={c.name}
                to="/search"
                search={{ category: c.name }}
                className="flex min-w-20 shrink-0 flex-col items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary md:flex-row md:text-sm md:font-semibold"
              >
                <Icon className="size-6 text-primary md:size-5" />
                <span>{c.label}</span>
              </Link>
            ))}
          </nav>
          <section className="mt-6 mb-12">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-medium tracking-wider text-primary uppercase">
                  A little curiosity goes a long way
                </p>
                <h2>Find your next story.</h2>
              </div>
              <Link
                to="/search"
                search={{}}
                className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-primary"
              >
                See all
                <ArrowRight className="size-4" />
              </Link>
            </div>
            {resultGrid}
          </section>
          <section className="grid gap-8 rounded-xl bg-secondary p-6 md:grid-cols-2 md:items-center md:gap-12 md:p-12">
            <div className="flex flex-col items-start gap-5">
              <h2>
                A little time.
                <br />A great discovery.
              </h2>
              <p className="max-w-sm text-muted-foreground">
                Book a local experience today or plan for the next available
                time.
              </p>
              <Link to="/nearby" search={{}} className={buttonVariants()}>
                Explore nearby
                <ArrowRight data-icon="inline-end" />
              </Link>
            </div>
            {featured && (
              <Card className="gap-0 overflow-hidden md:flex-row md:items-stretch md:py-0">
                <Media
                  src={featured.image}
                  alt={featured.title}
                  className="aspect-video w-full object-cover md:m-6 md:mr-0 md:aspect-square md:w-28 md:self-center md:rounded-lg"
                />
                <div className="flex flex-1 flex-col justify-center gap-4 p-6">
                  <CardHeader className="gap-2 p-0">
                    <p className="text-xs text-muted-foreground">
                      {featured.destination} · {featured.category}
                    </p>
                    <CardTitle>{featured.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <p className="text-sm text-muted-foreground">
                      {featured.duration} · From{" "}
                      {money(featured.price, featured.currency ?? "LKR")} /
                      person
                    </p>
                  </CardContent>
                  <CardFooter className="border-0 bg-transparent p-0">
                    <Link
                      to="/experience/$id"
                      params={{ id: featured.id }}
                      search={{}}
                      className="flex min-h-11 items-center gap-2 font-semibold text-primary"
                    >
                      Find a time
                      <ArrowRight className="size-4" />
                    </Link>
                  </CardFooter>
                </div>
              </Card>
            )}
          </section>
          <section className="my-12 md:my-20">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-medium tracking-wider text-primary uppercase">
                  Start with a place
                </p>
                <h2>Where will curiosity take you?</h2>
              </div>
            </div>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 md:grid md:grid-cols-4 md:gap-6">
              {destinations.map((p) => (
                <Link
                  key={p.name}
                  to="/destinations/$slug"
                  params={{ slug: destinationSlug(p.name) }}
                  className="group relative isolate aspect-[4/3] w-64 shrink-0 snap-start overflow-hidden rounded-lg bg-hero text-hero-foreground md:w-auto"
                >
                  <Media
                    src={p.image}
                    alt={p.name}
                    className="absolute inset-0 -z-20 size-full object-cover transition-transform group-hover:scale-[1.025] motion-reduce:transition-none"
                  />
                  <div className="absolute inset-0 -z-10 bg-linear-to-t from-hero/90 to-transparent" />
                  <div className="absolute inset-x-5 bottom-5">
                    <h3>{p.name}</h3>
                    <p className="mt-2 flex justify-between text-sm">
                      {p.country}
                      <ArrowRight className="size-4" />
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </>
    );
  return (
    <section>
      <div className="mb-8 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Find something worth going out for
        </p>
        <h1>
          {parsed.destination
            ? `Discover ${parsed.destination}`
            : parsed.q
              ? `Discover ${parsed.q}`
              : "Find your next experience."}
        </h1>
        <form className="max-w-[700px]" onSubmit={submit}>
          {searchInput}
        </form>
      </div>
      <Link
        to="/nearby"
        search={{}}
        className={cn(buttonVariants({ variant: "outline" }), "mb-5")}
      >
        Map and list of live local hosts
      </Link>
      <Field
        orientation="horizontal"
        className="mb-5 rounded-xl border bg-card p-4"
      >
        <Switch
          id="live-now"
          checked={parsed.live}
          onCheckedChange={(live) =>
            void navigate({
              to: "/search",
              search: { ...parsed, live, page: 1 },
            })
          }
        />
        <div>
          <FieldLabel htmlFor="live-now">Live Now</FieldLabel>
          <p className="text-sm text-muted-foreground">
            Online hosts accepting requests, with available places. Refreshes
            every 15 seconds.
          </p>
        </div>
      </Field>
      <Button
        variant="outline"
        className="mb-5 lg:hidden"
        aria-expanded={filtersOpen}
        aria-controls="catalog-filter-panel"
        onClick={() => setFiltersOpen(!filtersOpen)}
      >
        Filter experiences
      </Button>
      <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside
          id="catalog-filter-panel"
          className={cn(!filtersOpen && "hidden lg:block")}
        >
          <Card>
            <CardHeader>
              <CardTitle>Filter experiences</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                id="catalog-filters"
                key={JSON.stringify(parsed)}
                onSubmit={submit}
              >
                <input type="hidden" name="filterForm" value="1" />
                <input type="hidden" name="q" value={parsed.q} />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="category">Category</FieldLabel>
                    <NativeSelect
                      id="category"
                      name="category"
                      defaultValue={parsed.category}
                    >
                      <NativeSelectOption value="">
                        All experiences
                      </NativeSelectOption>
                      {[
                        ...categories.map((c) => c.name),
                        "Cultural experiences",
                        "Outdoor activities",
                      ].map((c) => (
                        <NativeSelectOption key={c}>{c}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="destination">Destination</FieldLabel>
                    <Input
                      id="destination"
                      name="destination"
                      defaultValue={parsed.destination}
                      maxLength={120}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="search-date">Date</FieldLabel>
                    <Input
                      id="search-date"
                      name="date"
                      type="date"
                      min={today()}
                      max={addDays(today(), 180)}
                      defaultValue={parsed.date}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="duration">Duration</FieldLabel>
                    <NativeSelect
                      id="duration"
                      name="duration"
                      defaultValue={parsed.duration ?? ""}
                    >
                      <NativeSelectOption value="">
                        Any duration
                      </NativeSelectOption>
                      <NativeSelectOption value="short">
                        Up to 4 hours
                      </NativeSelectOption>
                      <NativeSelectOption value="long">
                        More than 4 hours
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Separator />
                  <Field>
                    <FieldLabel htmlFor="minPrice">Min price (LKR)</FieldLabel>
                    <Input
                      id="minPrice"
                      name="minPrice"
                      type="number"
                      min="0"
                      defaultValue={parsed.minPrice}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="maxPrice">Max price (LKR)</FieldLabel>
                    <Input
                      id="maxPrice"
                      name="maxPrice"
                      type="number"
                      min="0"
                      defaultValue={parsed.maxPrice}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sort">Sort by</FieldLabel>
                    <NativeSelect
                      id="sort"
                      name="sort"
                      defaultValue={parsed.sort}
                    >
                      <NativeSelectOption value="recommended">
                        Recommended
                      </NativeSelectOption>
                      <NativeSelectOption value="price-low">
                        Lowest price
                      </NativeSelectOption>
                      <NativeSelectOption value="rating">
                        Highest rated
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field orientation="horizontal">
                    <Checkbox
                      id="freeCancellation"
                      name="freeCancellation"
                      defaultChecked={parsed.freeCancellation}
                    />
                    <FieldLabel htmlFor="freeCancellation">
                      Free cancellation
                    </FieldLabel>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
            <CardFooter className="flex-wrap gap-2">
              <Button type="submit" form="catalog-filters" className="flex-1">
                Apply filters
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setFilterError(undefined);
                  void navigate({ to: "/search", search: {} });
                }}
              >
                Reset
              </Button>
            </CardFooter>
          </Card>
        </aside>
        <div>
          {!!filterError && <Problem error={filterError} />}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl">Experiences</h2>
            <p className="text-sm text-muted-foreground">
              {query.data?.total ?? "…"} experiences found
            </p>
          </div>
          {resultGrid}
          {query.data && query.data.total > 24 && (
            <div className="mt-8 flex items-center justify-center gap-5">
              <Button
                variant="outline"
                disabled={parsed.page === 1}
                onClick={() =>
                  navigate({
                    to: "/search",
                    search: { ...parsed, page: parsed.page - 1 },
                  })
                }
              >
                Previous
              </Button>
              <span>Page {parsed.page}</span>
              <Button
                variant="outline"
                disabled={parsed.page * 24 >= query.data.total}
                onClick={() =>
                  navigate({
                    to: "/search",
                    search: { ...parsed, page: parsed.page + 1 },
                  })
                }
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
