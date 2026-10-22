import { useEffect, useState } from "react";
import { useMediaUrl } from "@/features/catalog/media";
import { cn } from "@/lib/utils";
export function ProfileAvatar({
  name,
  mediaId,
  className,
}: {
  name: string;
  mediaId?: string | null;
  className?: string;
}) {
  const signed = useMediaUrl(mediaId ?? undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [signed.data]);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "T";
  return (
    <div
      className={cn(
        "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-2xl font-semibold text-secondary-foreground",
        className,
      )}
    >
      {signed.data && !failed ? (
        <img
          src={signed.data}
          alt={`${name}'s profile photo`}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`${name}'s profile`}>{initials}</span>
      )}
    </div>
  );
}
