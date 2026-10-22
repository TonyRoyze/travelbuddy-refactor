import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
          "my-6 grid grid-cols-1 gap-3",
          photos.length === 2 && "sm:grid-cols-[2fr_1fr]",
          photos.length > 2 && "sm:grid-cols-[2fr_1fr_1fr]",
        )}
      >
        {photos.slice(0, 3).map((src, i) => (
          <Button
            key={src}
            type="button"
            variant="ghost"
            aria-label={`Open experience photo ${i + 1}`}
            className={cn(
              "relative h-64 overflow-hidden rounded-xl p-0 sm:h-[400px]",
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
              <span className="absolute bottom-4 left-4 rounded-lg bg-card px-3 py-2 text-sm text-foreground">
                View photos · {photos.length}
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
