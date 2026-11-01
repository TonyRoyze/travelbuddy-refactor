import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState, type FormEvent } from "react";
import {
  Compass,
  Utensils,
  Landmark,
  Sparkles,
  Trees,
  Waves,
  Map,
  SlidersHorizontal,
} from "lucide-react";
import { useMoney } from "@/features/currency/currency-provider";
import { catalogQuery } from "@/lib/queries";
import { useLiveNowUpdates } from "@/lib/live-now";
import { searchSchema, today } from "@/lib/validation";
import { CatalogSearchInput } from "./search-input";
import { addDays } from "./selection";
import { Switch } from "@/components/ui/switch";
import { ExperienceCard } from "./experience-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectCombobox } from "@/components/custom-ui/select-combobox";
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
import { Problem, Loading, NoResults } from "@/components/custom-ui/feedback";
const MeetingMap = lazy(() =>
  import("@/features/nearby/meeting-map").then((module) => ({
    default: module.MeetingMap,
  })),
);
const categories = [
  { name: "Tours & sightseeing", label: "Tours", icon: Landmark },
  { name: "Food & drink", label: "Food & drink", icon: Utensils },
  { name: "Tickets & passes", label: "Attractions", icon: Compass },
  { name: "Day trips", label: "Day trips", icon: Sparkles },
  { name: "Wildlife", label: "Wildlife", icon: Trees },
  { name: "Cruises & sailing", label: "Cruises & sailing", icon: Waves },
];
export function CatalogPage({
  filters = {},
}: {
  filters?: Record<string, unknown>;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const money = useMoney();
  const [filterError, setFilterError] = useState<unknown>();
  const parsed = searchSchema.parse(filters);
  const query = useQuery(catalogQuery(parsed));
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
      travelers: parsed.travelers,
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
  const active = packages.some((item) => item.id === activeId)
    ? activeId
    : undefined;
  const points = packages.flatMap((item) => {
    const point = item.location;
    return point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
      ? [
          {
            id: item.id,
            latitude: point.latitude,
            longitude: point.longitude,
            label: `${item.title} · ${point.label}`,
            price: money(item.price, item.currency ?? "LKR"),
          },
        ]
      : [];
  });
  function selectFromMap(id: string) {
    setActiveId(id);
    setMapOpen(false);
    requestAnimationFrame(() => {
      const card = document.getElementById(`result-${id}`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.querySelector("a")?.focus({ preventScroll: true });
    });
  }
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
    <div className="catalog-card-grid">
      {packages.map((p) => (
        <div
          key={p.id}
          id={`result-${p.id}`}
          className="catalog-result-card"
          data-active={active === p.id || undefined}
          onMouseEnter={() => setActiveId(p.id)}
          onMouseLeave={() => setActiveId(undefined)}
          onFocusCapture={() => setActiveId(p.id)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setActiveId(undefined);
          }}
        >
          <ExperienceCard
            experience={p}
            date={parsed.date}
            travelers={parsed.travelers}
          />
        </div>
      ))}
    </div>
  );
  return (
    <section className="catalog-results">
      <div className="catalog-search-toolbar">
        <h1 className="sr-only">
          {parsed.destination
            ? `Experiences in ${parsed.destination}`
            : parsed.q
              ? `Experiences matching ${parsed.q}`
              : "Explore experiences"}
        </h1>
        <form className="catalog-compact-search" onSubmit={submit}>
          {searchInput}
        </form>
      </div>
      <div className="catalog-filter-toolbar">
        <Button
          variant="outline"
          aria-expanded={filtersOpen}
          aria-controls="catalog-filter-panel"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal />
          Filters
        </Button>
        <div
          className="catalog-filter-chips"
          aria-label="Experience categories"
        >
          <Link
            to="/search"
            search={{ ...parsed, category: "", page: 1 }}
            aria-current={!parsed.category ? "page" : undefined}
          >
            All experiences
          </Link>
          {categories.map((category) => (
            <Link
              key={category.name}
              to="/search"
              search={{ ...parsed, category: category.name, page: 1 }}
              aria-current={
                parsed.category === category.name ? "page" : undefined
              }
            >
              {category.label}
            </Link>
          ))}
        </div>
        <Field orientation="horizontal" className="w-auto shrink-0">
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
          <FieldLabel htmlFor="live-now">Live now</FieldLabel>
        </Field>
      </div>
      <div
        id="catalog-filter-panel"
        className={cn("catalog-filter-panel", !filtersOpen && "hidden")}
      >
        <Card className="overflow-visible bg-transparent ring-0 [--card-spacing:0px] md:[--card-spacing:0px]">
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
                  <SelectCombobox
                    id="category"
                    name="category"
                    defaultValue={parsed.category}
                    placeholder="All experiences"
                    options={[
                      "",
                      ...categories.map((c) => c.name),
                      "Cultural experiences",
                      "Outdoor activities",
                    ].map((category) => ({
                      value: category,
                      label: category || "All experiences",
                    }))}
                  />
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
                  <SelectCombobox
                    id="duration"
                    name="duration"
                    defaultValue={parsed.duration ?? ""}
                    placeholder="Any duration"
                    options={[
                      { value: "", label: "Any duration" },
                      { value: "short", label: "Up to 4 hours" },
                      { value: "long", label: "More than 4 hours" },
                    ]}
                  />
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
                  <SelectCombobox
                    id="sort"
                    name="sort"
                    defaultValue={parsed.sort}
                    options={[
                      { value: "recommended", label: "Recommended" },
                      { value: "price-low", label: "Lowest price" },
                      { value: "rating", label: "Highest rated" },
                    ]}
                  />
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
                void navigate({
                  to: "/search",
                  search: (previous) => ({
                    ...previous,
                    category: "",
                    destination: "",
                    date: undefined,
                    duration: undefined,
                    live: false,
                    minPrice: undefined,
                    maxPrice: undefined,
                    freeCancellation: false,
                    sort: "recommended",
                    page: 1,
                  }),
                });
              }}
            >
              Reset
            </Button>
          </CardFooter>
        </Card>
      </div>
      <div className="catalog-map-layout">
        <div className="catalog-list-column">
          {!!filterError && <Problem error={filterError} />}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {query.data?.total ?? "…"} experiences
              {parsed.destination ? ` in ${parsed.destination}` : " to explore"}
            </h2>
            <p className="text-sm text-muted-foreground">Prices per person</p>
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
        <aside
          className={cn(
            "catalog-map-column",
            mapOpen && "catalog-map-mobile-open",
          )}
          aria-label="Experience locations"
        >
          <Button
            className="catalog-close-map"
            variant="outline"
            onClick={() => setMapOpen(false)}
          >
            Show list
          </Button>
          <Suspense
            fallback={
              <div className="catalog-map-loading">
                <Loading />
              </div>
            }
          >
            <MeetingMap
              points={points}
              selected={active}
              onSelect={selectFromMap}
              markerStyle="price"
              className="catalog-results-map"
            />
          </Suspense>
          {!query.isPending &&
            !query.error &&
            points.length < packages.length && (
              <p className="catalog-map-caption">
                {packages.length - points.length}{" "}
                {packages.length - points.length === 1
                  ? "experience has"
                  : "experiences have"}{" "}
                no published map location yet.
              </p>
            )}
          {points.length === 0 && (
            <p className="catalog-map-empty">
              {query.isPending
                ? "Loading experience locations…"
                : query.error
                  ? "Locations are unavailable. Try searching again."
                  : "No map locations for these results. Explore the list for meeting-point details."}
            </p>
          )}
        </aside>
      </div>
      <Button className="catalog-show-map" onClick={() => setMapOpen(true)}>
        <Map />
        Show map
      </Button>
    </section>
  );
}
