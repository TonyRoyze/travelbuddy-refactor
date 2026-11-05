import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/supabase";
import { searchSchema, type SearchFilters } from "@/lib/validation";
import { discoveryTowns } from "@/features/nearby/towns";
import { MobileSearch } from "./mobile-search";
import { exploreSearchFilters } from "./explore-search-model";
import { CatalogFilterFields } from "./catalog-filter-fields";
import type { Guests } from "./guest-selector";
import type { SearchSuggestion } from "./search-input";

const towns = discoveryTowns();
export function ExploreMobileSearch({ filters }: { filters: SearchFilters }) {
  const navigate = useNavigate();
  const [destination, setDestination] = useState(
    filters.q || filters.destination || filters.country,
  );
  const [selected, setSelected] = useState<SearchSuggestion | undefined>(
    filters.destination
      ? { value: filters.destination, kind: "destination" }
      : filters.country
        ? { value: filters.country, kind: "country" }
        : undefined,
  );
  const [debounced, setDebounced] = useState(destination.trim());
  const [date, setDate] = useState(filters.date || "");
  const [endDate, setEndDate] = useState("");
  const [guests, setGuests] = useState<Guests>({
    adults: filters.travelers || 0,
    children: 0,
    infants: 0,
    pets: 0,
  });
  const [clear, setClear] = useState(false);
  const [reset, setReset] = useState(0);
  const [error, setError] = useState("");
  const defaults = clear ? searchSchema.parse({}) : filters;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebounced(destination.trim()),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [destination]);
  const matches = useQuery({
    queryKey: ["search-suggestions", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () =>
      (await rpc("search_suggestions", {
        query: debounced,
      })) as unknown as SearchSuggestion[],
    staleTime: 30000,
    retry: false,
  });
  const local: SearchSuggestion[] = towns
    .filter(
      (town) =>
        destination.trim().length < 2 ||
        town.toLowerCase().includes(destination.trim().toLowerCase()),
    )
    .slice(0, 7)
    .map((value) => ({ value, kind: "destination" }));
  const suggestions = [
    ...(destination.trim() === debounced && debounced.length >= 2
      ? matches.data || []
      : []),
    ...local,
  ].filter(
    (item, index, all) =>
      all.findIndex(
        (other) =>
          other.kind === item.kind &&
          other.value.toLowerCase() === item.value.toLowerCase(),
      ) === index,
  );
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = exploreSearchFilters(
        filters,
        { destination, selected, date, guests },
        new FormData(event.currentTarget),
      );
      setError("");
      void navigate({ to: "/search", search: next });
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Check your search filters and try again.",
      );
      return false;
    }
  }
  return (
    <MobileSearch
      destination={destination}
      onDestinationChange={(value, suggestion) => {
        setDestination(value);
        setSelected(suggestion);
      }}
      suggestions={suggestions}
      loading={matches.isFetching && destination.trim().length >= 2}
      date={date}
      endDate={endDate}
      onDatesChange={(start, end) => {
        setDate(start);
        setEndDate(end);
      }}
      guests={guests}
      onGuestsChange={setGuests}
      onSearch={search}
      onClearFilters={() => {
        setClear(true);
        setReset((value) => value + 1);
        setError("");
      }}
      error={error}
      filterSummary={filters.category || "Price, duration & more"}
      filters={
        <div key={reset} className="mobile-search-extra-filters">
          <CatalogFilterFields
            defaults={defaults}
            includeLocation={false}
            idPrefix="mobile-filter"
          />
          <section className="filter-section">
            <h3>Availability</h3>
            <label className="filter-toggle-option">
              <span>
                <strong>Live now</strong>
                <small>Find buddies available right now</small>
              </span>
              <input
                type="checkbox"
                name="live"
                defaultChecked={defaults.live}
              />
            </label>
          </section>
        </div>
      }
    />
  );
}
