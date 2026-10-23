import { useEffect, useState } from "react";
import { CatalogPage } from "./catalog-page";
import { destinationFromSlug, destinationMetadata } from "./destination-links";
import { NoResults } from "@/components/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
export function DestinationPage({ slug }: { slug: string }) {
  const town = destinationFromSlug(slug);
  const [notice, setNotice] = useState("");
  const meta = town
    ? destinationMetadata(town, window.location.origin)
    : undefined;
  useEffect(() => {
    if (!meta) return;
    const previous = document.title;
    document.title = meta.title;
    return () => {
      document.title = previous;
    };
  }, [meta]);
  if (!town || !meta)
    return (
      <NoResults
        title="Destination not found"
        description="Choose a Sri Lankan destination from Explore."
      />
    );
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              .writeText(meta.url)
              .then(() => setNotice("Destination link copied."))
              .catch(() => setNotice(`Copy this link: ${meta.url}`));
          }}
        >
          Copy destination link
        </Button>
        <a
          className={buttonVariants({ variant: "outline" })}
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(meta.url)}`}
        >
          Share on Facebook
        </a>
        <Link to="/nearby" search={{ area: town }} className="text-primary">
          Live hosts near {town}
        </Link>
        {notice && <p role="status">{notice}</p>}
      </div>
      <CatalogPage filters={{ destination: town, country: "Sri Lanka" }} />
    </>
  );
}
