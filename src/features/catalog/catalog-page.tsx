import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState, type FormEvent } from "react";
import { Map, SlidersHorizontal } from "lucide-react";
import { useMoney } from "@/features/currency/currency-provider";
import { catalogQuery } from "@/lib/queries";
import { useLiveNowUpdates } from "@/lib/live-now";
import { searchSchema } from "@/lib/validation";
import { CatalogSearchInput } from "./search-input";
import { CatalogFilterFields, categories } from "./catalog-filter-fields";
import { ExploreMobileSearch } from "./explore-mobile-search";
import { Switch } from "@/components/ui/switch";
import { ExperienceCard } from "./experience-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Problem, Loading, NoResults } from "@/components/custom-ui/feedback";
const MeetingMap = lazy(() =>
  import("@/features/nearby/meeting-map").then((module) => ({
    default: module.MeetingMap,
  })),
);
export function CatalogPage({
  filters = {},
}: {
  filters?: Record<string, unknown>;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clearDraft, setClearDraft] = useState(false);
  const [filterReset, setFilterReset] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const money = useMoney();
  const [filterError, setFilterError] = useState<unknown>();
  const parsed = searchSchema.parse(filters);
  const defaults = clearDraft ? searchSchema.parse({}) : parsed;
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
    setFiltersOpen(false);
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
      <div className="md:hidden mb-4">
        <ExploreMobileSearch key={JSON.stringify(parsed)} filters={parsed} />
      </div>
      <div className="catalog-search-toolbar hidden md:flex">
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
      <div className="catalog-filter-toolbar hidden md:flex">
        <Button
          variant="outline"
          aria-expanded={filtersOpen}
          onClick={() => {
            setClearDraft(false);
            setFilterError(undefined);
            setFiltersOpen(true);
          }}
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
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent
          className="catalog-filter-dialog"
          showCloseButton={false}
        >
          <div className="catalog-filter-dialog-header">
            <span aria-hidden="true" />
            <DialogTitle>Filters</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
            >
              ×
            </Button>
          </div>
          <form
            id="catalog-filters"
            key={`${JSON.stringify(parsed)}:${filterReset}`}
            className="filter-modal-body"
            onSubmit={submit}
          >
            <input type="hidden" name="filterForm" value="1" />
            <input type="hidden" name="q" value={parsed.q} />
            <CatalogFilterFields defaults={defaults} />
            {!!filterError && (
              <div role="alert">
                <Problem error={filterError} />
              </div>
            )}
          </form>
          <div className="filter-modal-footer">
            <button
              type="button"
              className="filter-clear"
              onClick={() => {
                setClearDraft(true);
                setFilterReset((value) => value + 1);
                setFilterError(undefined);
              }}
            >
              Clear all
            </button>
            <Button type="submit" form="catalog-filters">
              Show experiences
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
