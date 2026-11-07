import { mediaApiUrl } from "@/lib/media-api";
import { Camera } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, rpc } from "@/lib/supabase";
import { accountQuery } from "@/lib/queries";
import { validateProfileFile } from "./profile-model";
import { readUploadResult } from "./upload-result";
import type { Account } from "./types";
import { ProfileAvatar } from "./profile-avatar";
import { VideoMedia } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/custom-ui/file-upload";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Problem } from "@/components/custom-ui/feedback";
export function ProfileMedia({
  account,
  kind,
}: {
  account: Account;
  kind: "photo" | "video";
}) {
  const client = useQueryClient(),
    id = useId();
  const libraryInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const refresh = async (updated?: Account) => {
    if (updated) client.setQueryData(["account"], updated);
    else await client.invalidateQueries({ queryKey: ["account"] });
    void client.invalidateQueries({ queryKey: ["buddy-profile", account.id] });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const validation = validateProfileFile(file, kind);
      if (validation) throw new Error(validation);
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session) throw new Error("Sign in to upload a file.");
      const response = await fetch(mediaApiUrl("/profile-media/upload"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": file.type,
          "X-Media-Kind": kind,
          "X-Profile-Revision": String(account.revision),
        },
        body: file,
      });
      const mediaId = await readUploadResult(response);
      const updated = await client.fetchQuery({
        ...accountQuery(),
        staleTime: 0,
      });
      const attached =
        kind === "photo"
          ? updated.avatarMediaId === mediaId
          : updated.profileVideoIds.includes(mediaId);
      if (!attached)
        throw new Error(
          "The upload could not be confirmed on your profile. Please reload your profile before trying again.",
        );
      await refresh(updated);
    },
    onSuccess: () => {
      setFiles([]);
      setNotice(
        kind === "photo"
          ? "Your profile photo is saved."
          : "Your introduction video is saved.",
      );
    },
  });
  const change = useMutation({
    mutationFn: async (ids: string[]) =>
      (await rpc("set_profile_media", {
        input:
          kind === "photo"
            ? { kind: "photo", id: null }
            : { kind: "videos", ids },
        expected_revision: account.revision,
      })) as unknown as Account,
    onSuccess: async (account) => {
      await refresh(account);
      setNotice(
        kind === "photo"
          ? "Your profile photo is removed."
          : "Your video clips are updated.",
      );
    },
  });
  const pending = upload.isPending || change.isPending;
  const clips = account.profileVideoIds;
  const choose = (file?: File) => {
    setError(undefined);
    setNotice("");
    upload.reset();
    change.reset();
    if (file) {
      const message = validateProfileFile(file, kind);
      if (message) {
        setError(new Error(message));
        return;
      }
      upload.mutate(file);
    }
  };
  if (kind === "photo") {
    const selectPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      choose(file);
    };
    return (
      <div
        className="flex shrink-0 flex-col items-center gap-2"
        aria-busy={pending}
      >
        <input
          ref={libraryInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Select profile photo from library"
          className="hidden"
          disabled={pending}
          onChange={selectPhoto}
        />
        <div className="relative mb-2 size-24">
          <ProfileAvatar
            name={account.displayName}
            mediaId={account.avatarMediaId}
            className="size-24 border-4 border-card"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute left-1/2 top-18 z-10 w-18 h-8 -translate-x-1/2 justify-around rounded-full border-0 bg-card shadow-sm"
            disabled={pending}
            onClick={() => libraryInput.current?.click()}
          >
            <Camera data-icon="inline-start" />
            {pending ? "Saving…" : account.avatarMediaId ? "Edit" : "Add"}
          </Button>
        </div>
        {(error || upload.error || change.error) && (
          <Problem error={error ?? upload.error ?? change.error} />
        )}
        {notice && (
          <p role="status" className="text-center text-sm">
            {notice}
          </p>
        )}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meet your buddy, on video.</CardTitle>
        <CardDescription>
          Introduce yourself or share a glimpse of the places you know. Up to
          three MP4/WebM clips, 60 seconds and 25 MB each.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {clips.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {clips.map((clip, index) => (
              <div key={clip} className="flex flex-col gap-3">
                <VideoMedia
                  id={clip}
                  title={`Introduction video ${index + 1}`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      change.mutate(clips.filter((value) => value !== clip))
                    }
                  >
                    Remove clip {index + 1}
                  </Button>
                  {index > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        const next = [...clips];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        change.mutate(next);
                      }}
                    >
                      Move earlier
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <Field data-disabled={pending}>
          <FieldLabel htmlFor={id}>
            {pending ? "Saving…" : "Upload introduction video"}
          </FieldLabel>
          <FileUpload
            id={id}
            files={files}
            multiple={false}
            accept="video/mp4,video/webm"
            busy={upload.isPending}
            disabled={pending || clips.length >= 3}
            label="Upload introduction video"
            description="MP4 or WebM · Up to 25 MB and 60 seconds. Each clip saves automatically."
            validateFile={(file) => validateProfileFile(file, kind)}
            onReject={(message) => {
              setError(new Error(message));
              setNotice("");
              upload.reset();
              change.reset();
            }}
            onFilesChange={(selected) => {
              setFiles(selected);
              choose(selected[0]);
            }}
          />
        </Field>
        {clips.length >= 3 && (
          <p className="text-sm text-muted-foreground">
            Remove a clip to add another.
          </p>
        )}
        {(error || upload.error || change.error) && (
          <Problem error={error ?? upload.error ?? change.error} />
        )}
        {notice && <p role="status">{notice}</p>}
      </CardContent>
    </Card>
  );
}
