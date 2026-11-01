import { useMoney } from "@/features/currency/currency-provider";
import { Link } from "@tanstack/react-router";
import { MapPin, Star, CheckCircle2, Clock } from "lucide-react";
import type { Experience } from "./types";
import { Media } from "./media";

export function ExperienceCard({
  experience: p,
  date,
  travelers,
}: {
  experience: Experience;
  date?: string;
  travelers?: number;
}) {
  const money = useMoney();
  return (
    <div className="group flex flex-col rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs hover:shadow-md transition-all duration-200">
      {/* Photo with badges */}
      <Link
        to="/experience/$id"
        params={{ id: p.id }}
        search={{
          ...(date ? { date } : {}),
          ...(travelers ? { travelers } : {}),
        }}
        className="relative block aspect-[16/10] sm:aspect-[4/3] w-full overflow-hidden bg-muted"
      >
        <Media
          src={p.image}
          alt={p.title}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
        />
        {/* Floating top badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10 pointer-events-none">
          {p.liveNow && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
              <span className="size-1.5 rounded-full bg-white animate-pulse" />
              Live Now
            </span>
          )}
          {p.rating >= 4.8 && !p.liveNow && (
            <span className="inline-flex items-center rounded-full bg-background/90 backdrop-blur-xs px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-xs">
              Top Rated
            </span>
          )}
        </div>
      </Link>

      {/* Card Body */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {/* Location & Category */}
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span>{p.destination}</span>
          <span>·</span>
          <span className="truncate">{p.category}</span>
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          <Link
            to="/experience/$id"
            params={{ id: p.id }}
            search={{
              ...(date ? { date } : {}),
              ...(travelers ? { travelers } : {}),
            }}
          >
            {p.title}
          </Link>
        </h3>

        {/* Rating and Duration */}
        <div className="flex items-center gap-1.5 text-xs text-foreground mb-2">
          <div className="flex items-center gap-1 font-bold">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            <span>{p.rating.toFixed(1)}</span>
          </div>
          <span className="text-muted-foreground">({p.reviews} reviews)</span>
          <span className="text-muted-foreground">·</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" />
            {p.duration}
          </span>
        </div>

        {/* Free cancellation reassurance */}
        {p.freeCancellation && (
          <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-3 mt-auto">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>Free cancellation</span>
          </div>
        )}

        {/* Price footer */}
        <div className="mt-auto pt-3 border-t border-border/60 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">From</span>
          <div className="text-right">
            <span className="text-lg font-bold text-foreground">
              {money(p.price, p.currency ?? "LKR")}
            </span>
            <span className="text-xs text-muted-foreground font-normal"> / person</span>
          </div>
        </div>
      </div>
    </div>
  );
}
