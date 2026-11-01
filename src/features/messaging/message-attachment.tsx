import { useQuery } from "@tanstack/react-query";
import { FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
} from "@/components/ui/attachment";
import { Button, buttonVariants } from "@/components/ui/button";
import type { MessageAttachment as FileAttachment } from "./types";

export function MessageAttachment({ file }: { file: FileAttachment }) {
  const url = useQuery({
    queryKey: ["chat-file", file.path],
    queryFn: async () => {
      const result = await supabase.storage
        .from("chat-files")
        .createSignedUrl(file.path, 600);
      if (result.error) throw new Error(result.error.message);
      return result.data.signedUrl;
    },
    staleTime: 480000,
    refetchInterval: 480000,
    retry: 1,
  });
  return (
    <Attachment
      size="sm"
      state={url.isPending ? "processing" : url.error ? "error" : "done"}
    >
      <AttachmentMedia
        variant={file.type?.startsWith("image/") && url.data ? "image" : "icon"}
      >
        {file.type?.startsWith("image/") && url.data ? (
          <img src={url.data} alt={file.name} loading="lazy" />
        ) : (
          <FileText />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.name}</AttachmentTitle>
        <AttachmentDescription>
          {url.error
            ? "Could not load attachment"
            : `${Math.max(1, Math.round(file.size / 1024))} KB`}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        {url.data && (
          <a
            href={url.data}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${file.name}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ExternalLink />
          </a>
        )}
        {url.error && (
          <Button variant="ghost" size="sm" onClick={() => void url.refetch()}>
            Retry
          </Button>
        )}
      </AttachmentActions>
    </Attachment>
  );
}
