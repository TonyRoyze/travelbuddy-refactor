import { useRef, useState } from "react";
import { Minus, Plus, Search, UsersRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export type Guests = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
};
const rows = [
  { key: "adults", label: "Adults", description: "Ages 13 or above" },
  { key: "children", label: "Children", description: "Ages 2 – 12" },
  { key: "infants", label: "Infants", description: "Under 2" },
  {
    key: "pets",
    label: "Pets",
    description: "Bringing a service animal?",
  },
] as const;

export function GuestSelector({
  value,
  onChange,
  open,
  onOpenChange,
}: {
  value: Guests;
  onChange: (value: Guests) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [animalInfo, setAnimalInfo] = useState(false);
  const people = value.adults + value.children + value.infants;
  const summary = [
    people ? `${people} ${people === 1 ? "guest" : "guests"}` : "",
    value.pets ? `${value.pets} ${value.pets === 1 ? "pet" : "pets"}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div
        className="home-guest-segment"
        data-open={open || undefined}
      >
        <PopoverTrigger
          ref={anchor}
          type="button"
          className="home-guest-trigger"
          aria-label={`Who: ${summary || "Add guests"}`}
        >
          <span className="home-search-label"><UsersRound aria-hidden="true" /> Who</span>
          <span className="home-guest-summary">{summary || "Add guests"}</span>
        </PopoverTrigger>
        <button
          type="submit"
          className="home-search-submit"
          aria-label="Search experiences"
        >
          <Search aria-hidden="true" />
          <span>Search</span>
        </button>
      </div>
      <PopoverContent
        anchor={anchor}
        align="center"
        sideOffset={12}
        className="home-guest-popover"
      >
        <div className="home-guest-popover-heading">
          <PopoverTitle className="home-guest-popover-title">Who’s joining?</PopoverTitle>
          <p>Choose your group size</p>
        </div>
        {rows.map(({ key, label, description }) => (
          <div key={key} className="home-guest-row">
            <div>
              <p className="home-guest-label">{label}</p>
              {key === "pets" ? (
                <button
                  type="button"
                  className="home-guest-description home-service-animal"
                  onClick={() => setAnimalInfo(true)}
                >
                  {description}
                </button>
              ) : (
                <p className="home-guest-description">{description}</p>
              )}
            </div>
            <div className="home-guest-counter" role="group" aria-label={label}>
              <button
                type="button"
                disabled={value[key] === 0}
                aria-label={`Remove ${label.toLowerCase()}`}
                onClick={() =>
                  onChange({ ...value, [key]: Math.max(0, value[key] - 1) })
                }
              >
                <Minus aria-hidden="true" />
              </button>
              <span
                aria-live="polite"
                aria-atomic="true"
                aria-label={`${value[key]} ${label.toLowerCase()}`}
              >
                {value[key]}
              </span>
              <button
                type="button"
                disabled={key === "pets" ? value.pets >= 12 : people >= 12}
                aria-label={`Add ${label.toLowerCase()}`}
                onClick={() => onChange({ ...value, [key]: value[key] + 1 })}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        <Dialog open={animalInfo} onOpenChange={setAnimalInfo}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bringing a service animal?</DialogTitle>
              <DialogDescription>
                Contact your experience host about access and any arrangements
                you need. Selecting pets here does not confirm animal access or
                add animals to your booking.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </PopoverContent>
    </Popover>
  );
}
