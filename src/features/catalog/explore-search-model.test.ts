import { describe, expect, it } from "vitest";
import { searchSchema } from "@/lib/validation";
import { exploreSearchFilters } from "./explore-search-model";
const guests = { adults: 2, children: 1, infants: 0, pets: 1 };
const previous = searchSchema.parse({
  destination: "Galle",
  country: "Sri Lanka",
  minPrice: 500,
  maxPrice: 5000,
  duration: "long",
  freeCancellation: true,
  live: true,
  sort: "rating",
  page: 4,
});
const form = (values: Record<string, string> = {}) => {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
};
describe("Explore search sheet", () => {
  it("submits destination, date, group, and advanced filters together", () => {
    const result = exploreSearchFilters(
      previous,
      {
        destination: "Ella",
        selected: { kind: "destination", value: "Ella" },
        date: "2026-12-01",
        guests,
      },
      form({
        category: "Wildlife",
        duration: "short",
        minPrice: "1000",
        maxPrice: "2000",
        freeCancellation: "on",
        live: "on",
        sort: "price-low",
      }),
    );
    expect(result).toMatchObject({
      destination: "Ella",
      country: "",
      q: "",
      date: "2026-12-01",
      travelers: 3,
      category: "Wildlife",
      duration: "short",
      minPrice: 1000,
      maxPrice: 2000,
      freeCancellation: true,
      live: true,
      sort: "price-low",
      page: 1,
    });
  });
  it("clears previous filters and location when the sheet is cleared", () => {
    expect(
      exploreSearchFilters(
        previous,
        {
          destination: "",
          date: "",
          guests: { adults: 0, children: 0, infants: 0, pets: 0 },
        },
        form(),
      ),
    ).toEqual(searchSchema.parse({}));
  });
  it("replaces an old destination with a free text query", () => {
    expect(
      exploreSearchFilters(
        previous,
        { destination: "tea tasting", date: "", guests },
        form(),
      ),
    ).toMatchObject({ q: "tea tasting", destination: "", country: "" });
  });
  it("rejects reversed and negative price ranges", () => {
    for (const values of [
      { minPrice: "200", maxPrice: "100" },
      { minPrice: "-1", maxPrice: "100" },
    ]) {
      expect(() =>
        exploreSearchFilters(
          previous,
          { destination: "", date: "", guests },
          form(values),
        ),
      ).toThrow();
    }
  });
});
