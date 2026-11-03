import { ProfileAvatar } from "@/features/account/profile-avatar";

export default function Avatar04({
  name,
  mediaId,
}: {
  name: string;
  mediaId?: string | null;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3 text-left">
      <ProfileAvatar
        name={name}
        mediaId={mediaId}
        className="size-9 border border-border bg-transparent text-xs"
      />
      <span className="hidden min-w-0 flex-col gap-1 sm:flex">
        <span className="truncate font-semibold leading-none tracking-tight">
          {name}
        </span>
      </span>
    </span>
  );
}
