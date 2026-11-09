import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Star,
  Compass,
  MapPin,
  Calendar as CalendarIcon,
  Sparkles,
  Building2,
  CircleCheck,
  BadgeCheck,
  TicketCheck,
} from "lucide-react";
import { catalogQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { searchSchema, today } from "@/lib/validation";
import { useLiveNowUpdates } from "@/lib/live-now";
import { Loading, NoResults, Problem } from "@/components/custom-ui/feedback";
import { ExperienceCard } from "./experience-card";
import { Media } from "./media";
import { addDays } from "./selection";
import { destinations } from "./destinations";
import { destinationSlug } from "./destination-links";
import { MobileSearch } from "./mobile-search";
import { GuestSelector, type Guests } from "./guest-selector";
import type { SearchSuggestion } from "./search-input";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=85`;

const categories = [
  {
    label: "Cultural & Heritage",
    category: "Cultural experiences",
    image: photo("photo-1515003197210-e0cd71810b5f"),
    description: "Ancient temples & sacred sites",
  },
  {
    label: "Food & Cooking",
    category: "Food & drink",
    image: photo("photo-1555939594-58d7cb561ad1"),
    description: "Street food, tea & spice tours",
  },
  {
    label: "Outdoor Adventures",
    category: "Outdoor activities",
    image: photo("photo-1464822759023-fed622ff2c3b"),
    description: "Hikes, waterfalls & peaks",
  },
  {
    label: "Tickets & Passes",
    category: "Tickets & passes",
    image: destinations[1].image,
    description: "Fortresses & landmark entry",
  },
  {
    label: "Day Trips & Tours",
    category: "Day trips",
    image: photo("photo-1476514525535-07fb3b4ae5f1"),
    description: "Guided full-day excursions",
  },
  {
    label: "Wildlife & Safari",
    category: "Wildlife",
    image: destinations[2].image,
    description: "Elephants, leopards & whales",
  },
  {
    label: "Cruises & Sailing",
    category: "Cruises & sailing",
    image: photo("photo-1544551763-46a013bb70d5"),
    description: "Catamarans, surfing & lagoons",
  },
  {
    label: "Sightseeing",
    category: "Tours & sightseeing",
    image: photo("photo-1500530855697-b586d89ba3ee"),
    description: "City walks & scenic viewpoints",
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<SearchSuggestion>();
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [debouncedDestination, setDebouncedDestination] = useState("");
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [endDate, setEndDate] = useState("");
  const dateAnchor = useRef<HTMLButtonElement>(null);
  const [guests, setGuests] = useState<Guests>({
    adults: 0,
    children: 0,
    infants: 0,
    pets: 0,
  });
  const travelers = guests.adults + guests.children + guests.infants;
  const query = useQuery(
    catalogQuery(searchSchema.parse({})),
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedDestination(destinationText.trim()),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [destinationText]);
  const destinationMatches = useQuery({
    queryKey: ["search-suggestions", debouncedDestination],
    enabled: debouncedDestination.length >= 2,
    queryFn: async () =>
      (await rpc("search_suggestions", {
        query: debouncedDestination,
      })) as unknown as SearchSuggestion[],
    staleTime: 30000,
    retry: false,
  });
  useLiveNowUpdates();
  const packages = query.data?.items ?? [];
  const popularDestinations: SearchSuggestion[] = Array.from(
    new Map(
      packages
        .filter((item) => item.destination.trim())
        .map((item) => [item.destination, { value: item.destination, kind: "destination" as const }]),
    ).values(),
  ).slice(0, 7);
  const suggestionItems =
    destinationText.trim().length >= 2
      ? destinationText.trim() === debouncedDestination
        ? (destinationMatches.data ?? [])
        : []
      : popularDestinations;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void navigate({
      to: "/search",
      search: searchSchema.parse({
        q:
          selectedSuggestion &&
          !["destination", "country", "category"].includes(selectedSuggestion.kind)
            ? selectedSuggestion.value
            : selectedSuggestion
              ? undefined
              : destinationText || data.get("q"),
        destination:
          selectedSuggestion?.kind === "destination"
            ? selectedSuggestion.value
            : undefined,
        country:
          selectedSuggestion?.kind === "country"
            ? selectedSuggestion.value
            : undefined,
        category:
          selectedSuggestion?.kind === "category"
            ? selectedSuggestion.value
            : undefined,
        date: date || undefined,
        travelers: travelers || undefined,
      }),
    });
  }

  return (
      <div className="home-page flex flex-col gap-12 sm:gap-16 pb-12">
      {/* A landscape led welcome to Sri Lanka */}
      <section className="home-hero relative overflow-hidden bg-neutral-900 text-white mx-4 sm:mx-6 lg:mx-8 mt-4 shadow-xl">
        <Media
          src="https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=2000&q=85"
          alt="Travelers exploring a scenic mountain landscape"
          className="absolute inset-0 size-full object-cover object-center opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/5" />

        <div className="relative z-10 mx-auto w-full max-w-[1340px] px-6 py-14 sm:py-20 lg:py-24 text-left flex flex-col items-start">
          <h1 className="mt-5 max-w-3xl text-4xl font-medium tracking-tight sm:text-6xl lg:text-7xl text-balance leading-[1.02]">
            Take the scenic route.
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg text-neutral-100 text-balance leading-relaxed">
            Find your own way around the World, with local people who know every turn, taste and tale.
          </p>

          <div className="mt-8 w-full md:hidden">
            <MobileSearch
              destination={destinationText}
              onDestinationChange={(value, suggestion) => { setDestinationText(value); setSelectedSuggestion(suggestion); }}
              suggestions={destinationText.trim().length >= 2 ? suggestionItems : popularDestinations.length ? popularDestinations : destinations.map((place) => ({ value: place.query, kind: "destination" as const }))}
              loading={destinationText.trim().length >= 2 && destinationMatches.isFetching}
              date={date}
              endDate={endDate}
              onDatesChange={(start, end) => { setDate(start); setEndDate(end); }}
              guests={guests}
              onGuestsChange={setGuests}
              onSearch={search}
            />
          </div>

          {/* Search Bar Embedded in Hero */}
          <div
            className="home-search-band hidden w-full max-w-5xl mt-8 sm:mt-10 md:block"
            data-guests-open={guestsOpen || undefined}
          >
            <form
              className="home-search w-full bg-background text-foreground shadow-2xl rounded-2xl sm:rounded-full border border-border p-2"
              onSubmit={search}
            >
              <label className="home-search-place home-search-field text-left" htmlFor="home-where">
                <span className="home-search-label text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="size-3.5 text-primary" /> Where to?
                </span>
                <Autocomplete<SearchSuggestion>
                  items={suggestionItems}
                  filter={null}
                  open={destinationOpen}
                  onOpenChange={setDestinationOpen}
                  value={destinationText}
                  itemToStringValue={(item) => item.value}
                  onValueChange={(next, details) => {
                    setDestinationText(next);
                    if (details.reason === "item-press") {
                      setSelectedSuggestion(
                        suggestionItems.find((item) => item.value === next),
                      );
                    } else {
                      setSelectedSuggestion(undefined);
                    }
                  }}
                >
                  <AutocompleteInputGroup className="home-destination-input">
                    <AutocompleteInput
                      id="home-where"
                      name="q"
                      maxLength={120}
                      autoComplete="off"
                      placeholder="Search destinations or experiences"
                      className="home-destination-input-control"
                      onFocus={() => setDestinationOpen(true)}
                    />
                  </AutocompleteInputGroup>
                  <AutocompleteContent className="home-destination-popover">
                    <div className="home-destination-popover-heading">
                      {destinationText.trim().length >= 2
                        ? "Matching destinations and experiences"
                        : "Suggested destinations"}
                    </div>
                    {suggestionItems.length ? (
                      <AutocompleteList className="home-destination-list">
                        {(item: SearchSuggestion) => {
                          const Icon =
                            item.kind === "country"
                              ? Building2
                              : item.kind === "category"
                                ? Compass
                                : item.kind === "package"
                                  ? Sparkles
                                  : MapPin;
                          const country = packages.find(
                            (result) => result.destination === item.value,
                          )?.country;
                          const description =
                            item.kind === "destination"
                              ? country
                                ? `Explore experiences · ${country}`
                                : "Explore local experiences"
                              : item.kind === "country"
                                ? "Explore experiences around the country"
                                : item.kind === "category"
                                  ? "Browse this experience category"
                                  : "View this experience";
                          return (
                            <AutocompleteItem
                              key={`${item.kind}:${item.value}`}
                              value={item}
                              className="home-destination-option"
                            >
                              <span className="home-destination-icon" data-kind={item.kind}>
                                <Icon aria-hidden="true" />
                              </span>
                              <span className="home-destination-copy">
                                <strong>{item.value}</strong>
                                <small>{description}</small>
                              </span>
                            </AutocompleteItem>
                          );
                        }}
                      </AutocompleteList>
                    ) : (
                      <p className="home-destination-empty">
                        {destinationMatches.isPending
                          ? "Finding places…"
                          : "No matches yet. Keep typing or search this place."}
                      </p>
                    )}
                  </AutocompleteContent>
                </Autocomplete>
              </label>

              <Popover
                  open={dateOpen}
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) {
                      setDateOpen(true);
                      return;
                    }
                    if (date && !endDate) return;
                    setDateOpen(false);
                  }}
                >
                  <PopoverTrigger
                    ref={dateAnchor}
                    type="button"
                    className="home-date-trigger"
                    aria-label={`When: ${date ? `${date}${endDate ? ` to ${endDate}` : ""}` : "Choose dates"}`}
                  >
                    <span className="home-search-label"><CalendarIcon aria-hidden="true" /> When?</span>
                    <span className="home-date-value">{date ? `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`))}${endDate ? ` – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${endDate}T12:00:00`))}` : " · Choose end date"}` : "Add dates"}</span>
                  </PopoverTrigger>
                  <PopoverContent
                    anchor={dateAnchor}
                    align="center"
                    sideOffset={12}
                    className="home-date-popover"
                  >
                    <div className="home-date-popover-heading">
                      <PopoverTitle className="home-guest-popover-title">When are you going?</PopoverTitle>
                      <p>{date && !endDate ? "Choose your end date" : "Select your start date, then end date"}</p>
                    </div>
                    <DateCalendar
                      mode="range"
                      min={1}
                      selected={
                        date
                          ? {
                              from: new Date(`${date}T12:00:00`),
                              ...(endDate ? { to: new Date(`${endDate}T12:00:00`) } : {}),
                            }
                          : undefined
                      }
                      onSelect={(range: DateRange | undefined) => {
                        const toIso = (value: Date) => {
                          const year = value.getFullYear();
                          const month = String(value.getMonth() + 1).padStart(2, "0");
                          const day = String(value.getDate()).padStart(2, "0");
                          return `${year}-${month}-${day}`;
                        };
                        if (!range?.from) {
                          setDate("");
                          setEndDate("");
                          return;
                        }
                        setDate(toIso(range.from));
                        setEndDate(range.to ? toIso(range.to) : "");
                        if (range.to) setDateOpen(false);
                      }}
                      disabled={{ before: new Date(`${today()}T00:00:00`), after: new Date(`${addDays(today(), 180)}T23:59:59`) }}
                    />
                  </PopoverContent>
                </Popover>

              <GuestSelector
                value={guests}
                onChange={setGuests}
                open={guestsOpen}
                onOpenChange={setGuestsOpen}
              />
            </form>
          </div>
        </div>
      </section>

      {guestsOpen && (
        <div
          className="home-search-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
          onClick={() => setGuestsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* TravelBuddy values */}
      <section className="mx-auto w-full max-w-[1340px] px-4 sm:px-6 lg:px-8">
        <div className="home-trust-grid grid grid-cols-2 md:grid-cols-4">
          <div className="home-trust-item">
            <CircleCheck className="home-trust-icon" aria-hidden="true" />
            <div><p className="text-sm font-semibold text-foreground">Free cancellation</p><p className="text-xs text-muted-foreground">Up to 24 hours before</p></div>
          </div>
          <div className="home-trust-item">
            <BadgeCheck className="home-trust-icon" aria-hidden="true" />
            <div><p className="text-sm font-semibold text-foreground">Loved by travellers</p><p className="home-trust-rating"><Star className="size-3 fill-current" /> 4.9 <span>· verified reviews</span></p></div>
          </div>
          <div className="home-trust-item">
            <TicketCheck className="home-trust-icon" aria-hidden="true" />
            <div><p className="text-sm font-semibold text-foreground">Ready when you are</p><p className="text-xs text-muted-foreground">Instant confirmation</p></div>
          </div>
          <div className="home-trust-item">
            <Compass className="home-trust-icon" aria-hidden="true" />
            <div><p className="text-sm font-semibold text-foreground">People who know</p><p className="text-xs text-muted-foreground">Local guides, real stories</p></div>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <div className="mx-auto w-full max-w-[1340px] px-4 sm:px-6 lg:px-8 flex flex-col gap-14">
        {/* Category Shelves */}
        <section aria-labelledby="home-categories-title">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 id="home-categories-title" className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Explore by Category
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                From slow mornings to summit mornings
              </p>
            </div>
            <Link
              to="/search"
              search={{ country: "Sri Lanka" }}
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
            >
              All categories <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="home-category-grid">
            {categories.map((category) => (
              <Link
                key={category.label}
                to="/search"
                search={{ category: category.category, country: "Sri Lanka" }}
                className="home-category-tile group"
              >
                <span className="home-category-photo-wrap">
                  <Media
                    src={
                      packages.find((item) => item.category === category.category)
                        ?.image ?? category.image
                    }
                    alt={category.label}
                    className="home-category-image transition-transform duration-700 group-hover:scale-105"
                  />
                </span>
                <span className="home-category-copy">
                  <span className="home-category-title">{category.label}</span>
                  <span className="home-category-description">{category.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Top Experiences Grid */}
        <section aria-labelledby="home-experiences-title">
          <div className="flex items-center justify-between mb-6">
            <div>
                <h2 id="home-experiences-title" className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Stories worth stepping into
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Handpicked days out with people who call the island home
              </p>
            </div>
            <Link
              to="/search"
              search={{ country: "Sri Lanka" }}
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
            >
              See all experiences <ArrowRight className="size-4" />
            </Link>
          </div>

          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <Problem error={query.error} />
          ) : !packages.length ? (
            <NoResults
              title="More experiences are on the way"
              description="Explore another destination to find your next adventure."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {packages.slice(0, 8).map((experience) => (
                <ExperienceCard key={experience.id} experience={experience} />
              ))}
            </div>
          )}
        </section>

        {/* Popular Destinations Grid */}
        <section aria-labelledby="home-destinations-title">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 id="home-destinations-title" className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Top Sri Lankan Destinations
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Each place has its own pace. Find yours.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {destinations.map((destination) => (
              <Link
                key={destination.name}
                to="/destinations/$slug"
                params={{ slug: destinationSlug(destination.name) }}
                className="group relative block aspect-[16/10] overflow-hidden rounded-2xl bg-neutral-900 shadow-md"
              >
                <Media
                  src={destination.image}
                  alt={destination.name}
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-5 text-white flex items-end justify-between">
                  <div>
                    <h3 className="text-xl font-bold">{destination.name}</h3>
                    <p className="text-xs text-neutral-300">Sri Lanka · Tours & Day Trips</p>
                  </div>
                  <span className="flex size-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white group-hover:bg-primary transition-colors">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
