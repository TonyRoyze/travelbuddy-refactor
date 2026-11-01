import { useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Plus,
  Paperclip,
  Package,
  X,
  FileText,
  LoaderCircle,
} from "lucide-react";
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentActions,
  AttachmentAction,
} from "@/components/ui/attachment";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Problem } from "@/components/custom-ui/feedback";
import { buddyPackagesQuery } from "@/features/packages/queries";
import {
  attachmentTypes,
  validateChatFiles,
  sendChatMessage,
} from "./attachments";

function DraftFile({
  file,
  pending,
  onRemove,
}: {
  file: File;
  pending: boolean;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <Attachment size="sm" state={pending ? "uploading" : "idle"}>
      <AttachmentMedia variant={preview ? "image" : "icon"}>
        {preview ? <img src={preview} alt={file.name} /> : <FileText />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.name}</AttachmentTitle>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          aria-label={`Remove ${file.name}`}
          disabled={pending}
          onClick={onRemove}
        >
          <X />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

export function MessageComposer({
  conversationId,
  buddy,
}: {
  conversationId: string;
  buddy: boolean;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [packageId, setPackageId] = useState<string>();
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const client = useQueryClient();
  const packages = useQuery({ ...buddyPackagesQuery(), enabled: buddy });
  const published = packages.data?.filter((p) => p.input.published) ?? [];
  const selectedPackage = packages.data?.find((p) => p.id === packageId);
  const send = useMutation({
    mutationFn: () => sendChatMessage(conversationId, body, files, packageId),
    onSuccess: () => {
      setBody("");
      setFiles([]);
      setPackageId(undefined);
      setError(undefined);
      void client.invalidateQueries({ queryKey: ["messages", conversationId] });
      void client.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const canSend =
    !!(body.trim() || files.length || packageId) && !send.isPending;
  return (
    <form
      ref={form}
      className="border-t p-3 sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) send.mutate();
      }}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={attachmentTypes.join(",")}
        className="hidden"
        aria-label="Choose message attachments"
        disabled={send.isPending}
        onChange={(event) => {
          const next = [
            ...files,
            ...Array.from(event.currentTarget.files ?? []),
          ];
          event.currentTarget.value = "";
          const message = validateChatFiles(next);
          setError(message);
          if (!message) {
            setFiles(next);
            send.reset();
          }
        }}
      />
      <Field>
        <FieldLabel className="sr-only" htmlFor="message">
          Your message
        </FieldLabel>
        <InputGroup className="has-disabled:opacity-100! has-disabled:bg-muted!">
          {(files.length > 0 || packageId) && (
            <InputGroupAddon align="block-start" className="flex-wrap">
              {files.map((file, index) => (
                <DraftFile
                  key={`${file.name}-${index}`}
                  file={file}
                  pending={send.isPending}
                  onRemove={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
                />
              ))}
              {packageId && (
                <Attachment size="sm" state="done">
                  <AttachmentMedia>
                    <Package />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>
                      {selectedPackage?.input.title ?? "Experience"}
                    </AttachmentTitle>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      aria-label="Remove attached package"
                      disabled={send.isPending}
                      onClick={() => setPackageId(undefined)}
                    >
                      <X />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              )}
            </InputGroupAddon>
          )}
          <InputGroupTextarea
            id="message"
            placeholder="Write a message…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="p-3"
            maxLength={1000}
            rows={2}
            disabled={send.isPending}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (canSend) form.current?.requestSubmit();
              }
            }}
          />
          <InputGroupAddon align="block-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton
                    size="icon-sm"
                    variant="outline"
                    className="size-8! rounded-full!"
                    aria-label="Attach files or a package"
                    disabled={send.isPending}
                  />
                }
              >
                <Plus />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                className="w-72! max-w-[calc(100vw-2rem)]"
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                    <Paperclip />
                    Attach files
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {buddy && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {packages.isPending ? (
                        <DropdownMenuItem disabled>
                          Loading packages…
                        </DropdownMenuItem>
                      ) : packages.error ? (
                        <DropdownMenuItem
                          onClick={() => void packages.refetch()}
                        >
                          Retry loading packages
                        </DropdownMenuItem>
                      ) : !published.length ? (
                        <DropdownMenuItem disabled>
                          No published packages
                        </DropdownMenuItem>
                      ) : (
                        published.map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            onClick={() => {
                              setPackageId(p.id);
                              send.reset();
                            }}
                          >
                            <Package />
                            {p.input.title}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className="ml-auto size-8! rounded-full!"
              disabled={!canSend}
              aria-label={send.isPending ? "Sending…" : "Send"}
            >
              {send.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ArrowUp />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {send.error && <Problem error={send.error} />}
    </form>
  );
}
