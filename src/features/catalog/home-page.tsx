import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ShieldCheck,
  Star,
  Zap,
  Compass,
  MapPin,
  Calendar,
  Sparkles,
} from "lucide-react";
import { catalogQuery } from "@/lib/queries";
import { searchSchema, today } from "@/lib/validation";
import { useLiveNowUpdates } from "@/lib/live-now";
import { Loading, NoResults, Problem } from "@/components/custom-ui/feedback";
import { ExperienceCard } from "./experience-card";
import { Media } from "./media";
import { addDays } from "./selection";
import { destinations } from "./destinations";
import { destinationSlug } from "./destination-links";
import { GuestSelector, type Guests } from "./guest-selector";

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
  const [guestsOpen, setGuestsOpen] = useState(false);
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
  useLiveNowUpdates();
  const packages = query.data?.items ?? [];

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void navigate({
      to: "/search",
      search: searchSchema.parse({
        q: data.get("q"),
        date: date || undefined,
        travelers: travelers || undefined,
      }),
    });
  }

  return (
    <div className="flex flex-col gap-12 sm:gap-16 pb-12">
      {/* Viator-style Clean Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-neutral-900 text-white mx-4 sm:mx-6 lg:mx-8 mt-4 shadow-xl">
        <Media
          src="https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=2000&q=85"
          alt="Travelers exploring a scenic mountain landscape"
          className="absolute inset-0 size-full object-cover object-center opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/30" />

        <div className="relative z-10 mx-auto max-w-4xl px-6 py-16 sm:py-24 text-center flex flex-col items-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-balance leading-[1.1]">
            Find & Book Unforgettable Experiences
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-neutral-200 text-balance leading-relaxed">
            Discover remarkable places, meet local guides, and book memorable
            tours and activities wherever your travels take you.
          </p>

          {/* Search Bar Embedded in Hero */}
          <div
            className="home-search-band w-full mt-8 sm:mt-10"
            data-guests-open={guestsOpen || undefined}
          >
            <form
              className="home-search w-full bg-background text-foreground shadow-2xl rounded-2xl sm:rounded-full border border-border p-2"
              onSubmit={search}
            >
              <label className="home-search-place flex flex-col px-4 py-2 text-left" htmlFor="home-where">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="size-3.5 text-primary" /> Where to?
                </span>
                <input
                  id="home-where"
                  name="q"
                  placeholder="Search destinations, cities, or experiences"
                  maxLength={120}
                  autoComplete="off"
                  className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/70 outline-none"
                />
              </label>

              <label className="flex flex-col px-4 py-2 text-left border-t sm:border-t-0 sm:border-l border-border/80" htmlFor="home-when">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="size-3.5 text-primary" /> When?
                </span>
                <input
                  id="home-when"
                  type="date"
                  min={today()}
                  max={addDays(today(), 180)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  aria-label="Experience date"
                  className="w-full bg-transparent text-sm font-semibold text-foreground outline-none"
                />
              </label>

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

      {/* Trust & Reassurance Badges (Viator Style) */}
      <section className="mx-auto w-full max-w-[1340px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-2xl border border-border/80 bg-card shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Free Cancellation</p>
              <p className="text-xs text-muted-foreground">Up to 24h before activity</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Star className="size-5 fill-amber-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Millions of Reviews</p>
              <p className="text-xs text-muted-foreground">4.9 / 5 verified ratings</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Zap className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Instant Confirmation</p>
              <p className="text-xs text-muted-foreground">Mobile tickets & instant hold</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Compass className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Local Guides & Buddies</p>
              <p className="text-xs text-muted-foreground">Insider access across the island</p>
            </div>
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
                Find activities suited to your travel style
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

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
            {categories.map((category) => (
              <Link
                key={category.label}
                to="/search"
                search={{ category: category.category, country: "Sri Lanka" }}
                className="group flex flex-col items-center rounded-2xl border border-border/70 bg-card p-3 text-center transition-all duration-200 hover:border-primary/50 hover:shadow-md"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted mb-2.5">
                  <Media
                    src={
                      packages.find((item) => item.category === category.category)
                        ?.image ?? category.image
                    }
                    alt={category.label}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <span className="text-xs font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                  {category.label}
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
                Top Experiences in Sri Lanka
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Highest-rated tours and bucket-list activities
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
                Start your adventure from iconic towns and ancient kingdoms
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
