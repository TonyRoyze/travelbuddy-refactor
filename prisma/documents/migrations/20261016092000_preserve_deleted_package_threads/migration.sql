-- Preserve private chat history if its listing is removed. The original context
-- still isolates the thread; new package threads always require a live listing.
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_context_key_check";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_key_check" CHECK (
  ("request_id" IS NULL OR "package_id" IS NULL) AND (
    ("package_id" IS NOT NULL AND "context_key" = 'package:' || "package_id") OR
    ("package_id" IS NULL AND "request_id" IS NOT NULL AND "context_key" = "request_id"::text) OR
    ("package_id" IS NULL AND "request_id" IS NULL AND
      ("context_key" = 'direct' OR "context_key" LIKE 'package:%'))
  )
);
