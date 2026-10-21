import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, rpc } from "@/lib/supabase";
import { validateProfileFile } from "./profile-model";
import type { Account } from "./types";
import { ProfileAvatar } from "./profile-avatar";
import { VideoMedia } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import FileUpload from "@/components/file-upload";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Problem } from "@/components/feedback";
export function ProfileMedia({
  account,
  kind,
}: {
  account: Account;
  kind: "photo" | "video";
}) {
  const client = useQueryClient(),
    id = useId();
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
      const response = await fetch("/profile-media/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": file.type,
          "X-Media-Kind": kind,
          "X-Profile-Revision": String(account.revision),
        },
        body: file,
      });
      const body = await response.json().catch(() => ({
        error: "The upload service is unavailable. Please try again.",
      }));
      if (!response.ok) throw new Error(body.error);
      await refresh();
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {kind === "photo"
            ? "Your profile photo"
            : "Meet your buddy, on video."}
        </CardTitle>
        <CardDescription>
          {kind === "photo"
            ? "Choose a photo that makes it easy to recognise you. JPEG, PNG or WebP, up to 5 MB."
            : "Introduce yourself or share a glimpse of the places you know. Up to three MP4/WebM clips, 60 seconds and 25 MB each."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {kind === "photo" ? (
          <div className="flex flex-wrap items-center gap-5">
            <ProfileAvatar
              name={account.displayName}
              mediaId={account.avatarMediaId}
            />
            {account.avatarMediaId && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => change.mutate([])}
              >
                Remove photo
              </Button>
            )}
          </div>
        ) : (
          clips.length > 0 && (
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
          )
        )}
        <Field data-disabled={pending}>
          <FieldLabel htmlFor={id}>
            {pending
              ? "Saving…"
              : kind === "photo"
                ? account.avatarMediaId
                  ? "Replace photo"
                  : "Upload photo"
                : "Upload introduction video"}
          </FieldLabel>
          <FileUpload
            id={id}
            files={files}
            multiple={false}
            accept={
              kind === "photo"
                ? "image/jpeg,image/png,image/webp"
                : "video/mp4,video/webm"
            }
            busy={upload.isPending}
            disabled={pending || (kind === "video" && clips.length >= 3)}
            label={
              kind === "photo"
                ? account.avatarMediaId
                  ? "Replace photo"
                  : "Upload photo"
                : "Upload introduction video"
            }
            description={
              kind === "photo"
                ? "JPEG, PNG or WebP · Up to 5 MB. Your photo saves automatically."
                : "MP4 or WebM · Up to 25 MB and 60 seconds. Each clip saves automatically."
            }
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
        {kind === "video" && clips.length >= 3 && (
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
