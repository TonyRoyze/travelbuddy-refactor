import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolved]);
  return (
    <img
      src={!failed && resolved ? resolved : "/brand/app-icon.svg"}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
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
