import {
  Compass,
  Utensils,
  Landmark,
  Sparkles,
  Trees,
  Waves,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectCombobox } from "@/components/custom-ui/select-combobox";
import { LocationAutocomplete } from "@/components/custom-ui/location-autocomplete";
import { Field, FieldLabel } from "@/components/ui/field";
import { today, type SearchFilters } from "@/lib/validation";
import { addDays } from "./selection";
export const categories = [
  { name: "Tours & sightseeing", label: "Tours", icon: Landmark },
  { name: "Food & drink", label: "Food & drink", icon: Utensils },
  { name: "Tickets & passes", label: "Attractions", icon: Compass },
  { name: "Day trips", label: "Day trips", icon: Sparkles },
  { name: "Wildlife", label: "Wildlife", icon: Trees },
  { name: "Cruises & sailing", label: "Cruises & sailing", icon: Waves },
];
export function CatalogFilterFields({
  defaults,
  includeLocation = true,
  idPrefix = "catalog-filter",
}: {
  defaults: SearchFilters;
  includeLocation?: boolean;
  idPrefix?: string;
}) {
  return (
    <>
      <section className="filter-section">
        <h3>Find your kind of experience</h3>
        <p>Choose what you would love to do.</p>
        <div className="filter-category-options">
          {[
            { name: "", label: "Everything", icon: Compass },
            ...categories,
            { name: "Cultural experiences", label: "Culture", icon: Landmark },
            { name: "Outdoor activities", label: "Outdoors", icon: Trees },
          ].map(({ name, label, icon: Icon }) => (
            <label className="filter-category-option" key={name}>
              <input
                type="radio"
                name="category"
                value={name}
                defaultChecked={defaults.category === name}
              />
              <span>
                <Icon aria-hidden="true" />
                <strong>{label}</strong>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="filter-section">
        <h3>Duration</h3>
        <div className="filter-segments">
          {[
            ["", "Any duration"],
            ["short", "Up to 4 hours"],
            ["long", "Over 4 hours"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="duration"
                value={value}
                defaultChecked={(defaults.duration ?? "") === value}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="filter-section">
        <h3>Price range</h3>
        <p>Experience price per person, in LKR.</p>
        <div className="filter-price-fields">
          <label>
            <span>Minimum</span>
            <div>
              <small>LKR</small>
              <Input
                aria-label="Minimum price in LKR"
                name="minPrice"
                type="number"
                min="0"
                step="any"
                placeholder="Any"
                defaultValue={defaults.minPrice}
              />
            </div>
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span>Maximum</span>
            <div>
              <small>LKR</small>
              <Input
                aria-label="Maximum price in LKR"
                name="maxPrice"
                type="number"
                min="0"
                step="any"
                placeholder="Any"
                defaultValue={defaults.maxPrice}
              />
            </div>
          </label>
        </div>
      </section>
      <section className="filter-section">
        <h3>Booking options</h3>
        <label className="filter-toggle-option">
          <span>
            <strong>Free cancellation</strong>
            <small>More flexibility when your plans change</small>
          </span>
          <input
            type="checkbox"
            name="freeCancellation"
            defaultChecked={defaults.freeCancellation}
          />
        </label>
      </section>
      {includeLocation && (
        <>
          <section className="filter-section">
            <h3>Where and when</h3>
            <div className="filter-details-grid">
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-destination`}>
                  Destination
                </FieldLabel>
                <LocationAutocomplete
                  id={`${idPrefix}-destination`}
                  name="destination"
                  placeholder="Any destination"
                  defaultValue={defaults.destination}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-date`}>
                  Experience date
                </FieldLabel>
                <Input
                  id={`${idPrefix}-date`}
                  name="date"
                  type="date"
                  min={today()}
                  max={addDays(today(), 180)}
                  defaultValue={defaults.date}
                />
              </Field>
            </div>
          </section>
        </>
      )}
      <section className="filter-section">
        <h3>Sort results</h3>
        <SelectCombobox
          id={`${idPrefix}-sort`}
          name="sort"
          defaultValue={defaults.sort}
          options={[
            { value: "recommended", label: "Recommended" },
            { value: "price-low", label: "Lowest price" },
            { value: "rating", label: "Highest rated" },
          ]}
        />
      </section>
    </>
  );
}
