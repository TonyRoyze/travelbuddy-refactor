import { useEffect, useState } from "react";
import { CatalogPage } from "./catalog-page";
import { destinationFromSlug, destinationMetadata } from "./destination-links";
import { NoResults } from "@/components/custom-ui/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Share2, Copy, Check, MapPin, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function DestinationPage({ slug }: { slug: string }) {
  const town = destinationFromSlug(slug);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const meta = town
    ? destinationMetadata(town, window.location.origin)
    : undefined;

  useEffect(() => {
    if (!meta) return;
    const previous = document.title;
    document.title = `${town} Tours & Experiences | TravelBuddy`;
    return () => {
      document.title = previous;
    };
  }, [meta, town]);

  if (!town || !meta)
    return (
      <NoResults
        title="Destination not found"
        description="Choose a Sri Lankan destination from Explore."
      />
    );

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link to="/" className="hover:text-primary transition-colors">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/search" search={{ country: "Sri Lanka" }} className="hover:text-primary transition-colors">
          Sri Lanka
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-semibold">{town}</span>
      </nav>

      {/* Destination Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/80">
        <div>
          <div className="flex items-center gap-1 text-xs font-bold text-primary uppercase tracking-wider mb-1">
            <MapPin className="size-3.5" /> Destination Guide
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Top Tours & Activities in {town}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse verified local experiences, day trips, and sightseeing in {town}, Sri Lanka.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 h-9 rounded-lg"
            onClick={() => {
              void navigator.clipboard
                .writeText(meta.url)
                .then(() => {
                  setCopied(true);
                  setNotice("Destination link copied to clipboard.");
                  setTimeout(() => setCopied(false), 2500);
                })
                .catch(() => setNotice(`Copy this link: ${meta.url}`));
            }}
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>

          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(meta.url)}`}
          >
            <Share2 className="size-3.5" />
            Share
          </a>
        </div>
      </div>

      {notice && !copied && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      {/* Embedded Catalog results filtered to this destination */}
      <CatalogPage filters={{ destination: town, country: "Sri Lanka" }} />
    </div>
  );
}
