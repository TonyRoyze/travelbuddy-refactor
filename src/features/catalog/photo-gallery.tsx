import { useState } from "react";
import { ChevronLeft, ChevronRight, Grid2X2 } from "lucide-react";
import { Media } from "./media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function PhotoGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const photos = [...new Set(images.filter(Boolean))];
  if (!photos.length) return null;
  const move = (by: number) =>
    setIndex((value) => (value + by + photos.length) % photos.length);
  return (
    <>
      <div
        className={cn(
          "experience-photo-grid",
          photos.length === 1 && "experience-photo-grid-single",
          photos.length === 2 && "experience-photo-grid-pair",
        )}
      >
        {photos.slice(0, 4).map((src, i) => (
          <Button
            key={src}
            type="button"
            variant="ghost"
            aria-label={`Open experience photo ${i + 1}`}
            className={cn(
              "relative h-full w-full overflow-hidden rounded-none p-0",
              i > 0 && "hidden sm:block",
            )}
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
          >
            <Media
              src={src}
              alt={`${title} photo ${i + 1}`}
              className="size-full object-cover"
            />
            {i === 0 && (
              <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-sm">
                <Grid2X2 className="size-4" /> All {photos.length} photos
              </span>
            )}
          </Button>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[95dvh] sm:max-w-5xl"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title} in pictures</DialogTitle>
            <DialogDescription>
              Explore every photo of this experience.
            </DialogDescription>
          </DialogHeader>
          <Media
            src={photos[index]}
            alt={`${title} photo ${index + 1}`}
            className="max-h-[65dvh] w-full rounded-lg object-contain"
          />
          <div className="flex items-center justify-center gap-5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous photo"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </Button>
            <span role="status">
              Photo {index + 1} of {photos.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next photo"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
