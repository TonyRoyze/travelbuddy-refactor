ALTER TABLE "conversations" DROP CONSTRAINT "conversations_context_key_check";
ALTER TABLE "conversations" ALTER COLUMN "context_key" TYPE VARCHAR(88);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_key_check" CHECK (
  ("request_id" IS NULL OR "package_id" IS NULL) AND
  "context_key" = CASE WHEN "package_id" IS NOT NULL THEN 'package:' || "package_id"
    ELSE COALESCE("request_id"::text, 'direct') END
);
