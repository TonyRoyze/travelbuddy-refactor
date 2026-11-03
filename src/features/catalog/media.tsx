import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
export function useMediaUrl(id?: string) {
  return useQuery({
    queryKey: ["media", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("media-url", {
        body: { id },
      });
      if (error) throw error;
      return data.url as string;
    },
    staleTime: 240000,
    refetchInterval: 240000,
    retry: 1,
  });
}
export function Media({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const id = /^\/api\/media\/([0-9a-f-]{36})$/.exec(src)?.[1];
  const signed = useMediaUrl(id);
  const resolved = id ? signed.data : src;
  const [failedSource, setFailedSource] = useState<string>();
  const [loadedSource, setLoadedSource] = useState<string>();
  const imageSource =
    resolved && (failedSource === resolved ? "/brand/app-icon.svg" : resolved);
  const loaded = !!imageSource && loadedSource === imageSource;
  return (
    <span className={cn("relative block", className)}>
      {!loaded && <Skeleton aria-hidden="true" className="absolute inset-0" />}
      {resolved && (
        <img
          key={imageSource}
          src={imageSource}
          ref={(element) => {
            if (element?.complete && element.naturalWidth > 0) {
              setLoadedSource(imageSource);
            }
          }}
          alt={alt}
          className={className}
          loading="lazy"
          onLoad={() => setLoadedSource(imageSource)}
          onError={() => {
            if (failedSource !== resolved) setFailedSource(resolved);
            else setLoadedSource(imageSource);
          }}
        />
      )}
    </span>
  );
}
export function VideoMedia({ id, title }: { id: string; title: string }) {
  const signed = useMediaUrl(id);
  if (signed.error)
    return <p role="status">This video is temporarily unavailable.</p>;
  return (
    <video
      src={signed.data}
      aria-label={title}
      controls
      playsInline
      preload="metadata"
      className="aspect-video w-full rounded-lg bg-muted"
    />
  );
}
