import { useEffect, useId, useRef, useState } from "react";
import { createSwapy } from "swapy";
import FileUpload from "@/components/custom-ui/file-upload";
import { supabase } from "@/lib/supabase";
import { Media, VideoMedia } from "@/features/catalog/media";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/custom-ui/delete-button";
import { Problem } from "@/components/custom-ui/feedback";
import { mediaUrl } from "./model";
export function PackageMediaPicker({
  kind,
  ids,
  onChange,
  onBusyChange,
  disabled,
}: {
  kind: "photo" | "video";
  ids: string[];
  onChange: (ids: string[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>();
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const idsKey = ids.join("\u0000");
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (kind !== "photo" || !idsKey.includes("\u0000") || !containerRef.current) return;
    const swapy = createSwapy(containerRef.current, {
      manualSwap: true,
      swapMode: "drop",
      enabled: !disabled && !busy,
    });
    swapy.onSwap((event) => {
      onChangeRef.current(event.newSlotItemMap.asArray.map(({ item }) => item));
    });
    return () => swapy.destroy();
  }, [kind, idsKey, disabled, busy]);

  const limit = kind === "photo" ? 6 : 3;
  const validate = (file: File) => {
    if (
      !(
        kind === "photo"
          ? ["image/jpeg", "image/png", "image/webp"]
          : ["video/mp4", "video/webm"]
      ).includes(file.type)
    )
      return kind === "photo"
        ? "Choose a JPEG, PNG or WebP photo."
        : "Choose an MP4 or WebM video.";
    if (!file.size || file.size > 25 * 1024 * 1024)
      return "Choose a non-empty file up to 25 MB.";
    return "";
  };
  async function upload(file: File) {
    setError(undefined);
    setBusy(true);
    onBusyChange(true);
    setProgress(0);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in before uploading.");
      const mediaId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/profile-media/package-upload");
        xhr.timeout = 60000;
        xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("X-Media-Kind", kind);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText);
            if (xhr.status < 200 || xhr.status >= 300)
              throw new Error(body.error || "Upload failed.");
            resolve(body.mediaId);
          } catch (error) {
            reject(error);
          }
        };
        xhr.onerror = xhr.ontimeout = () =>
          reject(
            new Error(
              "The upload did not finish. Check your connection and try again.",
            ),
          );
        xhr.send(file);
      });
      onChange([...ids, mediaId]);
      setFiles([]);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {kind === "photo" && ids.length > 1 && (
        <p className="text-sm text-muted-foreground">Drag photos to change their order.</p>
      )}
      <div
        ref={containerRef}
        className="grid gap-4 sm:grid-cols-2"
      >
        {ids.map((ref, index) => {
          const card = (
            <div className="relative flex h-full flex-col gap-2 rounded-lg border p-3">
              {kind === "video" ? (
                <>
                  <DeleteButton
                    data-swapy-no-drag
                    className="absolute right-5 top-5 z-10"
                    disabled={disabled || busy}
                    onConfirm={() => onChange(ids.filter((_, i) => i !== index))}
                  />
                  <VideoMedia id={ref} title={`Package video ${index + 1}`} />
                </>
              ) : (
                <div className="relative">
                  <Media
                    src={ref.includes("/") ? ref : mediaUrl(ref)}
                    alt={index === 0 ? "Package cover" : `Package photo ${index + 1}`}
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                  {index === 0 && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                      Cover photo
                    </span>
                  )}
                  <DeleteButton
                    data-swapy-no-drag
                    className="absolute right-3 top-3 z-10"
                    disabled={disabled || busy}
                    onConfirm={() => onChange(ids.filter((_, i) => i !== index))}
                  />
                </div>
              )}
              {(kind === "video" || index > 0) && (
                <p className="text-sm">
                  {kind === "video" ? `Clip ${index + 1}` : `Photo ${index + 1}`}
                </p>
              )}
              {kind === "video" && index > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-swapy-no-drag
                  disabled={disabled || busy}
                  onClick={() => {
                    const next = [...ids];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange(next);
                  }}
                >
                  Move clip {index + 1} earlier
                </Button>
              )}
            </div>
          );

          if (kind === "video") return <div key={ref}>{card}</div>;
          return (
            <div key={`slot-${index}`} data-swapy-slot={`slot-${index}`}>
              <div data-swapy-item={ref}>{card}</div>
            </div>
          );
        })}
      </div>
      <FileUpload
        id={id}
        files={files}
        onFilesChange={(next) => {
          setFiles(next);
          setError(undefined);
          if (next[0]) void upload(next[0]);
        }}
        multiple={false}
        busy={busy}
        disabled={disabled || ids.length >= limit}
        accept={
          kind === "photo"
            ? "image/jpeg,image/png,image/webp"
            : "video/mp4,video/webm"
        }
        label={
          kind === "photo" ? "Upload package photo" : "Upload package video"
        }
        description={
          kind === "photo"
            ? "Up to six photos, 25 MB each. The first is your cover."
            : "Up to three clips, 25 MB and 60 seconds each."
        }
        validateFile={validate}
        onReject={(message) => setError(new Error(message))}
      />
      {busy && (
        <div>
          <progress value={progress} max={100} aria-label="Upload progress" />
          <p role="status">
            {progress === 100
              ? "Checking your upload…"
              : `Uploading… ${progress}%`}
          </p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {ids.length} of {limit} {kind === "photo" ? "photos" : "clips"}. Save
        the package to publish media changes.
      </p>
      {!!error && <Problem error={error} />}
    </div>
  );
}
