import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type TagsInputProps = {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxTagLength?: number;
  describedBy?: string;
  inputLabel?: string;
  disabled?: boolean;
};

export function TagsInput({
  id,
  value,
  onChange,
  placeholder = "Add a highlight",
  maxTags = 12,
  maxTagLength = 240,
  describedBy,
  inputLabel = "Add a highlight",
  disabled = false,
}: TagsInputProps) {
  const [draft, setDraft] = useState("");

  function addTags(raw: string) {
    const next = raw
      .split(/[\n,]+/)
      .map((tag) => tag.trim().slice(0, maxTagLength))
      .filter(Boolean);
    const tags = [...value];
    for (const tag of next) {
      if (tags.length >= maxTags) break;
      if (
        !tags.some(
          (existing) =>
            existing.toLocaleLowerCase() === tag.toLocaleLowerCase(),
        )
      ) {
        tags.push(tag);
      }
    }
    if (tags.length !== value.length) onChange(tags);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (/[\n,]/.test(text)) {
      event.preventDefault();
      addTags([draft, text].filter(Boolean).join(","));
    }
  }

  return (
    <div className="flex min-h-12 w-full flex-wrap items-center gap-2 rounded-lg border-0 bg-muted px-2.5 py-2 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {value.map((tag, index) => (
        <Badge
          key={`${tag}-${index}`}
          variant="secondary"
          className="gap-1 pr-1"
        >
          <span className="max-w-56 truncate">{tag}</span>
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            disabled={disabled}
            className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        id={id}
        value={draft}
        maxLength={maxTagLength}
        aria-describedby={describedBy}
        aria-label={inputLabel}
        placeholder={value.length ? "Add another…" : placeholder}
        disabled={disabled || value.length >= maxTags}
        className="h-7 min-w-32 flex-1 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          if (draft.trim()) addTags(draft);
        }}
      />
    </div>
  );
}
