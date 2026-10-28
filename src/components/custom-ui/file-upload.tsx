import { FileText, LoaderCircle, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  id: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  description?: ReactNode;
  validateFile?: (file: File) => string;
  onReject?: (message: string) => void;
}

export default function FileUpload({
  id,
  files,
  onFilesChange,
  accept,
  multiple = true,
  maxFiles,
  disabled = false,
  busy = false,
  label = "Browse files",
  description,
  validateFile,
  onReject,
}: FileUploadProps) {
  const filePickerRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const unavailable = disabled || busy;
  const limit = multiple ? maxFiles : 1;

  function addFiles(selectedFiles: FileList | null) {
    if (unavailable || !selectedFiles?.length) return;
    const selected = Array.from(selectedFiles);
    const next = multiple ? [...files, ...selected] : selected;
    if (limit !== undefined && next.length > limit) {
      onReject?.(
        limit === 1
          ? "Choose one file at a time."
          : `Choose up to ${limit} files.`,
      );
      return;
    }
    for (const file of selected) {
      const message = validateFile?.(file);
      if (message) {
        onReject?.(message);
        return;
      }
    }
    onFilesChange(next);
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.currentTarget.files);
    // A failed upload can be retried by choosing the same file again.
    event.currentTarget.value = "";
  }

  function onDropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <div className="flex w-full flex-col gap-3" aria-busy={busy}>
      <Card
        className={cn(
          "w-full border-dashed py-6 shadow-none transition-colors",
          dragging && !unavailable && "bg-muted/50",
          unavailable && "opacity-60",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!unavailable) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = unavailable ? "none" : "copy";
        }}
        onDrop={onDropFiles}
      >
        <CardContent className="flex flex-col items-center gap-3 px-4 text-center">
          <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {busy
              ? "Uploading and checking your file…"
              : multiple
                ? "Drop files here or choose from your device."
                : "Drop a file here or choose from your device."}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={unavailable}
            onClick={() => filePickerRef.current?.click()}
          >
            {busy && (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {label}
          </Button>
          <input
            id={id}
            aria-label={label}
            aria-describedby={description ? `${id}-description` : undefined}
            className="sr-only"
            accept={accept}
            multiple={multiple}
            disabled={unavailable}
            onChange={onFileInputChange}
            ref={filePickerRef}
            tabIndex={-1}
            type="file"
          />
          {description && (
            <p
              id={`${id}-description`}
              className="text-xs text-muted-foreground"
            >
              {description}
            </p>
          )}
        </CardContent>
      </Card>
      {files.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label="Selected files">
          {files.map((file, index) => (
            <li
              className="flex items-center gap-3 px-3 py-2"
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
            >
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {file.name}
              </span>
              <Button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={unavailable}
                onClick={() =>
                  onFilesChange(
                    files.filter((_, fileIndex) => fileIndex !== index),
                  )
                }
                size="icon-sm"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
