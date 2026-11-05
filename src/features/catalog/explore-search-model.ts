import { searchSchema, type SearchFilters } from "@/lib/validation";
import type { Guests } from "./guest-selector";
import type { SearchSuggestion } from "./search-input";

export function exploreSearchFilters(
  previous: SearchFilters,
  draft: {
    destination: string;
    selected?: SearchSuggestion;
    date: string;
    guests: Guests;
  },
  form: FormData,
): SearchFilters {
  const minPrice = form.get("minPrice")
    ? Number(form.get("minPrice"))
    : undefined;
  const maxPrice = form.get("maxPrice")
    ? Number(form.get("maxPrice"))
    : undefined;
  if (
    [minPrice, maxPrice].some(
      (value) => value !== undefined && (!Number.isFinite(value) || value < 0),
    )
  ) {
    throw new Error("Enter a valid price of zero or more.");
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new Error("Minimum price must not exceed maximum price.");
  }
  const { destination, selected, date, guests } = draft;
  return searchSchema.parse({
    ...previous,
    q:
      selected && ["destination", "country", "category"].includes(selected.kind)
        ? ""
        : destination,
    destination: selected?.kind === "destination" ? selected.value : "",
    country: selected?.kind === "country" ? selected.value : "",
    category:
      selected?.kind === "category"
        ? selected.value
        : String(form.get("category") || ""),
    date: date || undefined,
    travelers: guests.adults + guests.children + guests.infants || undefined,
    duration: form.get("duration") || undefined,
    minPrice,
    maxPrice,
    freeCancellation: form.get("freeCancellation") === "on",
    live: form.get("live") === "on",
    sort: form.get("sort") || "recommended",
    page: 1,
  });
}
