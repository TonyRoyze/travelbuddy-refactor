import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Map, List, MessageCircle, MapPin, RefreshCw } from "lucide-react";
import { discoveryTowns } from "./towns";
import { areasQuery, liveQuery } from "./queries";
import { activeExperiences, type NearbySearch } from "./model";
import { MeetingMap } from "./meeting-map";
import type { LiveExperience } from "./types";
import { money } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Media } from "@/features/catalog/media";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Problem, Loading, NoResults } from "@/components/feedback";
export function NearbyPage({ filters }: { filters: NearbySearch }) {
  const navigate = useNavigate();
  const areas = useQuery(areasQuery());
  const towns = areas.data ?? discoveryTowns();
  const result = useQuery(liveQuery(filters.area));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const items =
    result.data && !result.error
      ? activeExperiences(
          result.data.items,
          result.data.serverTime,
          result.data.receivedAt,
          now,
        )
      : [];
  const selected = items.find(
    (item) => item.experience.id === filters.selected,
  );
  const onSelect = useCallback(
    (id: string) => {
      void navigate({
        to: "/nearby",
        search: (previous) => ({ ...previous, selected: id }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );
  const providerCount = new Set(items.map((item) => item.provider.id)).size;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1>Find a local who’s here now.</h1>
        <p className="max-w-2xl text-muted-foreground">
          Choose a town to find hosts online and accepting requests. Pins show
          their experiences’ meeting or pickup points.
        </p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4 md:p-5">
        <Field className="min-w-56 flex-1 sm:max-w-sm">
          <FieldLabel htmlFor="nearby-area">Town or area</FieldLabel>
          <NativeSelect
            id="nearby-area"
            value={filters.area}
            onChange={(event) =>
              void navigate({
                to: "/nearby",
                search: {
                  ...filters,
                  area: event.target.value,
                  selected: undefined,
                },
              })
            }
          >
            <NativeSelectOption value="">
              Choose a town or area
            </NativeSelectOption>
            {filters.area && !towns.includes(filters.area) && (
              <NativeSelectOption value={filters.area}>
                {filters.area}
              </NativeSelectOption>
            )}
            {towns.map((area) => (
              <NativeSelectOption key={area} value={area}>
                {area}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <ToggleGroup
          value={[filters.view]}
          onValueChange={(values) => {
            const view = values[0];
            if (view === "map" || view === "list")
              void navigate({
                to: "/nearby",
                search: { ...filters, view },
                replace: true,
                resetScroll: false,
              });
          }}
          variant="outline"
          aria-label="Discovery view"
        >
          <ToggleGroupItem value="map" aria-label="Map view">
            <Map data-icon="inline-start" />
            Map
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List data-icon="inline-start" />
            List
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {areas.error && (
        <div className="flex flex-col gap-3">
          <Problem error={areas.error} />
          <Button variant="outline" onClick={() => void areas.refetch()}>
            Retry towns
          </Button>
        </div>
      )}
      {!filters.area ? (
        <NoResults
          title="Start with a place"
          description={
            "Choose a Sri Lankan town or area above to see who’s online."
          }
        />
      ) : result.isPending ? (
        <Loading />
      ) : result.error ? (
        <div className="flex flex-col gap-3">
          <Problem error={result.error} />
          <Button variant="outline" onClick={() => void result.refetch()}>
            Retry live providers
          </Button>
        </div>
      ) : (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            aria-live="polite"
          >
            <h2 className="text-xl">
              {providerCount} {providerCount === 1 ? "host" : "hosts"} online in{" "}
              {filters.area}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {items.length}{" "}
                {items.length === 1 ? "experience" : "experiences"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={result.isFetching}
                onClick={() => void result.refetch()}
              >
                <RefreshCw data-icon="inline-start" />
                Refresh
              </Button>
            </div>
          </div>
          {!items.length ? (
            <NoResults
              title="It’s quiet here right now"
              description="No hosts are online and accepting requests in this area. Try another town or check back soon."
            />
          ) : (
            <div
              className={cn(
                "grid gap-5",
                filters.view === "map" &&
                  "lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]",
              )}
            >
              {filters.view === "map" && (
                <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
                  <MeetingMap
                    className="h-[380px] md:h-[520px]"
                    points={items.map((item) => ({
                      id: item.experience.id,
                      ...item.location,
                      label: `${item.experience.title} — ${item.location.label}`,
                    }))}
                    selected={selected?.experience.id}
                    onSelect={onSelect}
                  />
                  <p className="text-sm text-muted-foreground">
                    A shared pin groups experiences at the same meeting point.
                    All experiences stay listed alongside the map.
                  </p>
                </div>
              )}
              <div
                className={cn(
                  "grid items-start gap-4",
                  filters.view === "list" && "md:grid-cols-2 xl:grid-cols-3",
                )}
              >
                {selected && filters.view === "map" && (
                  <div className="rounded-xl border-2 border-primary bg-secondary p-4">
                    <p className="mb-2 text-sm">Selected meeting point</p>
                    <ResultCard item={selected} />
                  </div>
                )}
                {items
                  .filter(
                    (item) =>
                      filters.view !== "map" ||
                      item.experience.id !== selected?.experience.id,
                  )
                  .map((item) => (
                    <ResultCard
                      key={item.experience.id}
                      item={item}
                      selected={filters.selected === item.experience.id}
                      onSelect={() => onSelect(item.experience.id)}
                    />
                  ))}
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Status refreshes every 15 seconds. Online means the host is
            accepting requests; booking dates and places are checked separately.
          </p>
        </>
      )}
      <Link to="/search" search={{}} className="text-primary">
        Browse all experiences
      </Link>
    </section>
  );
}
function ResultCard({
  item,
  selected,
  onSelect,
}: {
  item: LiveExperience;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const p = item.experience;
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <Media
        src={p.image}
        alt={p.title}
        className="aspect-[16/9] w-full rounded-lg object-cover"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary">Online · accepting requests</Badge>
        <span className="text-sm text-muted-foreground">{p.category}</span>
      </div>
      <div>
        <h3>
          <Link to="/experience/$id" params={{ id: p.id }} search={{}}>
            {p.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Hosted by{" "}
          <Link
            to="/buddy/$id"
            params={{ id: item.provider.id }}
            className="text-primary"
          >
            {item.provider.name}
          </Link>
        </p>
      </div>
      <p className="flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        {item.location.label}
      </p>
      <p>
        From <strong>{money(p.price)}</strong> / person
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/inbox"
          search={{
            packageId: p.id,
            returnTo: `/experience/${encodeURIComponent(p.id)}`,
          }}
          className={buttonVariants({ size: "sm" })}
        >
          <MessageCircle data-icon="inline-start" />
          Chat with host
        </Link>
        <Link
          to="/experience/$id"
          params={{ id: p.id }}
          search={{}}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View experience
        </Link>
        {onSelect && (
          <Button variant="link" size="sm" onClick={onSelect}>
            Select meeting point
          </Button>
        )}
      </div>
    </article>
  );
}
