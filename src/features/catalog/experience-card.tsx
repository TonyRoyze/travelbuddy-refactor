import { useMoney } from "@/features/currency/currency-provider";
import { Link } from "@tanstack/react-router";
import { MapPin, Star, Check } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Experience } from "./types";
import { Media } from "./media";
export function ExperienceCard({
  experience: p,
  date,
}: {
  experience: Experience;
  date?: string;
}) {
  const money = useMoney();
  return (
    <Card variant="plain" className="gap-0 overflow-visible">
      <Link
        to="/experience/$id"
        params={{ id: p.id }}
        search={date ? { date } : {}}
        className="group block overflow-hidden rounded-lg"
      >
        <Media
          src={p.image}
          alt={p.title}
          className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.025] motion-reduce:transition-none"
        />
      </Link>
      <CardHeader className="gap-2 pt-4">
        <CardDescription className="flex flex-wrap items-center gap-1 text-xs">
          <MapPin className="size-3.5 shrink-0" />
          {p.destination}
          <span>· {p.category}</span>
          {p.liveNow && <Badge variant="secondary">Live now</Badge>}
        </CardDescription>
        <CardTitle>
          <Link
            to="/experience/$id"
            params={{ id: p.id }}
            search={date ? { date } : {}}
            className="text-base leading-snug font-semibold hover:text-primary md:text-lg"
          >
            {p.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-3 flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-1 text-xs md:text-sm">
          <Star className="size-3.5 fill-primary text-primary" />
          <strong>{p.rating.toFixed(1)}</strong>
          <span className="text-muted-foreground">({p.reviews} reviews)</span>
        </p>
        <p className="text-sm text-muted-foreground">{p.duration}</p>
      </CardContent>
      <CardFooter className="mt-2 flex-col items-start gap-2 rounded-none border-0 bg-transparent p-0">
        <p className="text-sm">
          From{" "}
          <strong className="text-xl font-semibold md:text-2xl">
            {money(p.price, p.currency ?? "LKR")}
          </strong>
          <span className="text-muted-foreground"> / person</span>
        </p>
        {p.freeCancellation && (
          <p className="flex items-center gap-1.5 text-xs text-primary md:text-sm">
            <Check className="size-3.5" />
            Free cancellation
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
