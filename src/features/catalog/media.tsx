import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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
  const { data } = useQuery({
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
    retry: 1,
  });
  return (
    <img
      src={id ? (data ?? "/brand/app-icon.svg") : src}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}
