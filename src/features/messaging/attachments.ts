import { supabase, rpc } from "@/lib/supabase";
import type { MessageAttachment } from "./types";

export const attachmentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "video/mp4",
  "video/webm",
];
export const MAX_ATTACHMENTS = 4;
export function validateChatFiles(files: File[]) {
  if (files.length > MAX_ATTACHMENTS)
    return "Attach up to four files per message.";
  for (const file of files) {
    if (!attachmentTypes.includes(file.type))
      return "Choose an image, PDF, text file, MP4 or WebM video.";
    if (!file.size || file.size > 10 * 1024 * 1024)
      return "Each file must be between 1 byte and 10 MB.";
    if (file.name.length > 255)
      return "File names must be 255 characters or fewer.";
  }
}

// Reuse completed uploads when a send fails, rather than uploading the files again.
const uploaded = new WeakMap<File, Map<string, MessageAttachment>>();
export async function sendChatMessage(
  conversationId: string,
  body: string,
  files: File[],
  packageId?: string,
) {
  const validation = validateChatFiles(files);
  if (validation) throw new Error(validation);
  if (!files.length && !packageId) {
    return rpc("send_message", {
      conversation_id: conversationId,
      body: body.trim(),
    });
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to send a message.");
  const attachments: MessageAttachment[] = [];
  for (const file of files) {
    const cacheKey = `${conversationId}/${data.user.id}`;
    let attachment = uploaded.get(file)?.get(cacheKey);
    if (!attachment) {
      const path = `${cacheKey}/${crypto.randomUUID()}`;
      const result = await supabase.storage
        .from("chat-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw new Error(result.error.message);
      attachment = { path, name: file.name, type: file.type, size: file.size };
      const cache = uploaded.get(file) ?? new Map();
      cache.set(cacheKey, attachment);
      uploaded.set(file, cache);
    }
    attachments.push(attachment);
  }
  return rpc("send_chat_message", {
    conversation_id: conversationId,
    body: body.trim(),
    files: attachments,
    package_id: packageId,
  });
}
