import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { Search, MapPin, Star, Clock, ArrowUpRight } from "lucide-react";
import { catalogQuery } from "@/lib/queries";
import { searchSchema, money } from "@/lib/validation";
import { Media } from "./media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading, NoResults } from "@/components/feedback";
export function CatalogPage({
  home = false,
  filters = {},
}: {
  home?: boolean;
  filters?: Record<string, unknown>;
}) {
  const parsed = searchSchema.parse(filters);
  const query = useQuery(catalogQuery(parsed));
  const navigate = useNavigate();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    navigate({
      to: "/search",
      search: {
        ...parsed,
        q: String(f.get("q") ?? ""),
        category: String(f.get("category") ?? ""),
        minPrice: f.get("minPrice") ? Number(f.get("minPrice")) : undefined,
        maxPrice: f.get("maxPrice") ? Number(f.get("maxPrice")) : undefined,
        freeCancellation: f.get("freeCancellation") === "on",
        sort: String(f.get("sort") ?? "recommended") as "recommended",
        page: 1,
      },
    });
  }
  return (
    <>
      <section className={home ? "hero" : "search-heading"}>
        {home ? (
          <>
            <img
              className="hero-image"
              src="https://images.unsplash.com/photo-1711100358840-ce6fd71c31b3?auto=format&fit=crop&w=2000&q=85"
              alt="Sigiriya rock rising above Sri Lanka’s green landscape"
            />
            <div className="hero-copy">
              <p>Good company. Great discoveries.</p>
              <h1>
                Find a little
                <br />
                extraordinary.
              </h1>
              <p>
                Local experiences, real connections, and stories that stay with
                you.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="text-primary">Follow your curiosity</p>
            <h1>Explore experiences</h1>
          </>
        )}
        <form
          className={home ? "hero-search" : "catalog-filters"}
          onSubmit={submit}
        >
          <FieldGroup className="filter-fields">
            <Field>
              <FieldLabel htmlFor="q">
                Where will curiosity take you?
              </FieldLabel>
              <Input
                key={parsed.q}
                id="q"
                name="q"
                defaultValue={parsed.q}
                placeholder="Try Colombo, wildlife, or food…"
                maxLength={120}
              />
            </Field>
            {!home && (
              <>
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
                      "Tours & sightseeing",
                      "Food & drink",
                      "Day trips",
                      "Wildlife",
                      "Cruises & sailing",
                      "Cultural experiences",
                      "Outdoor activities",
                      "Tickets & passes",
                    ].map((c) => (
                      <NativeSelectOption key={c}>{c}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="minPrice">Min price (USD)</FieldLabel>
                  <Input
                    id="minPrice"
                    name="minPrice"
                    type="number"
                    min="0"
                    defaultValue={parsed.minPrice}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="maxPrice">Max price (USD)</FieldLabel>
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
                  <input
                    type="checkbox"
                    id="freeCancellation"
                    name="freeCancellation"
                    defaultChecked={parsed.freeCancellation}
                  />
                  <FieldLabel htmlFor="freeCancellation">
                    Free cancellation
                  </FieldLabel>
                </Field>
              </>
            )}
          </FieldGroup>
          <Button type="submit" size="lg">
            <Search data-icon="inline-start" />
            Find experiences
          </Button>
        </form>
      </section>
      <section className="catalog-section">
        <div className="section-heading">
          <div>
            <h2>
              {home ? "A change of scenery starts here" : "Your next discovery"}
            </h2>
            <p>
              {home
                ? "Find your people, then find your adventure."
                : `${query.data?.total ?? "…"} experiences to explore`}
            </p>
          </div>
          {home && (
            <Link
              to="/search"
              search={{}}
              className="text-primary inline-flex items-center gap-2"
            >
              Explore all
              <ArrowUpRight className="size-4" />
            </Link>
          )}
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Problem error={query.error} />
        ) : query.data.items.length === 0 ? (
          <NoResults
            title="A different direction?"
            description="Try another destination or adjust your filters."
          />
        ) : (
          <>
            <div className="experience-grid">
              {query.data.items.map((item) => (
                <article key={item.id} className="experience-card">
                  <Link
                    to="/experience/$id"
                    params={{ id: item.id }}
                    search={{}}
                  >
                    <div className="experience-image">
                      <Media src={item.image} alt={item.title} />
                      <span>{item.category}</span>
                    </div>
                    <div className="flex flex-col gap-2 pt-4">
                      <p className="location">
                        <MapPin aria-hidden="true" />
                        {item.destination}, {item.country}
                      </p>
                      <h3>{item.title}</h3>
                      <p className="rating">
                        <Star aria-hidden="true" />
                        {item.rating} <span>({item.reviews} reviews)</span>
                      </p>
                      <div className="card-bottom">
                        <p>
                          <Clock aria-hidden="true" />
                          {item.duration}
                        </p>
                        <p>
                          from <strong>{money(item.price)}</strong>
                          <span> / person</span>
                        </p>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
            {!home && (
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
          </>
        )}
      </section>
    </>
  );
}
