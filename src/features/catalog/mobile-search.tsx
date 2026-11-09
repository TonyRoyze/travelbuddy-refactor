import { Button } from "@/components/ui/button";
import { useState, type FormEvent, type ReactNode } from "react";
import { Search, MapPin, Minus, Plus, CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import type { Guests } from "./guest-selector";
import type { SearchSuggestion } from "./search-input";
import { today } from "@/lib/validation";
import { addDays } from "./selection";

type Props = {
  destination: string;
  onDestinationChange: (value: string, suggestion?: SearchSuggestion) => void;
  suggestions: SearchSuggestion[];
  loading: boolean;
  date: string;
  endDate: string;
  onDatesChange: (start: string, end: string) => void;
  guests: Guests;
  onGuestsChange: (value: Guests) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void | boolean;
  filters?: ReactNode;
  filterSummary?: string;
  onClearFilters?: () => void;
  error?: string;
};
const guestRows = [
  { key: "adults", label: "Adults", detail: "Ages 13 or above" },
  { key: "children", label: "Children", detail: "Ages 2–12" },
  { key: "infants", label: "Infants", detail: "Under 2" },
  { key: "pets", label: "Pets", detail: "Service animals" },
] as const;
const iso = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );

export function MobileSearch(props: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"where" | "when" | "who" | "filters">(
    "where",
  );
  const people =
    props.guests.adults + props.guests.children + props.guests.infants;
  const guestSummary =
    [
      people ? `${people} ${people === 1 ? "guest" : "guests"}` : "",
      props.guests.pets ? `${props.guests.pets} pets` : "",
    ]
      .filter(Boolean)
      .join(", ") || "Add guests";
  const dateSummary = props.date
    ? `${formatDate(props.date)}${props.endDate ? ` – ${formatDate(props.endDate)}` : " · Add end date"}`
    : "Add dates";
  const selectDates = (range: DateRange | undefined) => {
    props.onDatesChange(
      range?.from ? iso(range.from) : "",
      range?.to ? iso(range.to) : "",
    );
    if (range?.to) setSection("who");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="mobile-search-launch md:hidden"
        onClick={() => setSection("where")}
      >
        <Search aria-hidden="true" />
        <span>
          <strong>{props.destination || "Where to?"}</strong>
          <small>
            {props.date ? dateSummary : "Any dates"} ·{" "}
            {people ? guestSummary : "Add guests"}
          </small>
        </span>
        <span className="mobile-search-launch-filter">
          <span className="sr-only">Open search filters</span>
          <CalendarDays aria-hidden="true" />
        </span>
      </DialogTrigger>
      <DialogContent
        fullScreen
        className="mobile-search-sheet"
        aria-describedby="mobile-search-description"
      >
        <div className="mobile-search-sheet-heading">
          <DialogTitle>Find your next experience</DialogTitle>
          <DialogDescription id="mobile-search-description">
            Choose a destination, dates, and your group.
          </DialogDescription>
        </div>
        <form
          noValidate
          className="mobile-search-sheet-form"
          onSubmit={(event) => {
            if (props.onSearch(event) !== false) setOpen(false);
            else if (props.filters) setSection("filters");
          }}
        >
          <div className="mobile-search-sheet-scroll">
            {(["where", "when", "who"] as const).map((key) => (
              <section
                key={key}
                className="mobile-search-panel"
                data-expanded={section === key}
              >
                <button
                  type="button"
                  className="mobile-search-panel-toggle"
                  aria-expanded={section === key}
                  aria-controls={`mobile-search-${key}`}
                  onClick={() => setSection(key)}
                >
                  <span>
                    {key === "where"
                      ? "Where?"
                      : key === "when"
                        ? "When"
                        : "Who"}
                  </span>
                  <small>
                    {key === "where"
                      ? props.destination || "Search destinations"
                      : key === "when"
                        ? dateSummary
                        : guestSummary}
                  </small>
                </button>
                <div
                  id={`mobile-search-${key}`}
                  className="mobile-search-panel-reveal"
                  inert={section !== key}
                >
                  <div className="mobile-search-panel-body">
                    {key === "where" && (
                      <>
                        <label className="mobile-search-destination">
                          <Search aria-hidden="true" />
                          <input
                            name="q"
                            aria-label="Search destinations or experiences"
                            placeholder="Search destinations"
                            autoComplete="off"
                            maxLength={120}
                            value={props.destination}
                            onChange={(event) =>
                              props.onDestinationChange(event.target.value)
                            }
                          />
                        </label>
                        <p className="mobile-search-suggestions-title">
                          {props.destination.trim().length >= 2
                            ? "Matching destinations and experiences"
                            : "Suggested destinations"}
                        </p>
                        <div className="mobile-search-suggestions">
                          {props.suggestions.map((item) => (
                            <button
                              type="button"
                              key={`${item.kind}:${item.value}`}
                              onClick={() => {
                                props.onDestinationChange(item.value, item);
                                setSection("when");
                              }}
                            >
                              <span className="mobile-search-place-icon">
                                <MapPin aria-hidden="true" />
                              </span>
                              <span>
                                <strong>{item.value}</strong>
                                <small>
                                  {item.kind === "destination"
                                    ? "Explore local experiences"
                                    : item.kind === "country"
                                      ? "Explore this country"
                                      : item.kind === "category"
                                        ? "Browse experiences"
                                        : "Discover this experience"}
                                </small>
                              </span>
                            </button>
                          ))}
                          {!props.suggestions.length && (
                            <p className="text-sm text-muted-foreground">
                              {props.loading
                                ? "Finding places…"
                                : "Search for a destination or experience."}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                    {key === "when" && (
                      <Calendar
                        mode="range"
                        min={1}
                        selected={
                          props.date
                            ? {
                                from: new Date(`${props.date}T12:00:00`),
                                ...(props.endDate
                                  ? {
                                      to: new Date(`${props.endDate}T12:00:00`),
                                    }
                                  : {}),
                              }
                            : undefined
                        }
                        onSelect={selectDates}
                        disabled={{
                          before: new Date(`${today()}T00:00:00`),
                          after: new Date(`${addDays(today(), 180)}T23:59:59`),
                        }}
                        className="mx-auto w-full"
                      />
                    )}
                    {key === "who" &&
                      guestRows.map(({ key: guestKey, label, detail }) => (
                        <div className="mobile-search-guest-row" key={guestKey}>
                          <span>
                            <strong>{label}</strong>
                            <small>{detail}</small>
                          </span>
                          <div
                            className="mobile-search-counter"
                            role="group"
                            aria-label={label}
                          >
                            <button
                              type="button"
                              aria-label={`Remove ${label.toLowerCase()}`}
                              disabled={props.guests[guestKey] === 0}
                              onClick={() =>
                                props.onGuestsChange({
                                  ...props.guests,
                                  [guestKey]: props.guests[guestKey] - 1,
                                })
                              }
                            >
                              <Minus />
                            </button>
                            <span aria-live="polite">
                              {props.guests[guestKey]}
                            </span>
                            <button
                              type="button"
                              aria-label={`Add ${label.toLowerCase()}`}
                              disabled={
                                guestKey === "pets"
                                  ? props.guests.pets >= 12
                                  : people >= 12
                              }
                              onClick={() =>
                                props.onGuestsChange({
                                  ...props.guests,
                                  [guestKey]: props.guests[guestKey] + 1,
                                })
                              }
                            >
                              <Plus />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            ))}
            {props.filters && (
              <section
                className="mobile-search-panel"
                data-expanded={section === "filters"}
              >
                <button
                  type="button"
                  className="mobile-search-panel-toggle"
                  aria-expanded={section === "filters"}
                  aria-controls="mobile-search-filters"
                  onClick={() => setSection("filters")}
                >
                  <span>Filters</span>
                  <small>{props.filterSummary || "Refine your search"}</small>
                </button>
                <div
                  id="mobile-search-filters"
                  className="mobile-search-panel-reveal"
                  inert={section !== "filters"}
                >
                  <div className="mobile-search-panel-body">
                    {props.filters}
                  </div>
                </div>
              </section>
            )}
            {props.error && (
              <p
                role="alert"
                className="rounded-xl bg-card p-4 text-destructive"
              >
                {props.error}
              </p>
            )}
          </div>
          <div className="mobile-search-sheet-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                props.onDestinationChange("");
                props.onDatesChange("", "");
                props.onGuestsChange({
                  adults: 0,
                  children: 0,
                  infants: 0,
                  pets: 0,
                });
                props.onClearFilters?.();
                setSection("where");
              }}
            >
              Clear all
            </Button>
            <button type="submit" className="mobile-search-confirm">
              <Search aria-hidden="true" />
              Search
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
