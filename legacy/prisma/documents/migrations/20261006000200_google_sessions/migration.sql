BEGIN;
CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "data" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_envelope" CHECK ("schema_version" = 1 AND "revision" > 0),
  CONSTRAINT "sessions_document" CHECK ((
    jsonb_typeof("data") = 'object'
    AND "data" ?& ARRAY['accountId', 'tokenHash', 'expiresAt']
    AND jsonb_typeof("data"->'accountId') = 'string'
    AND "data"->>'accountId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND jsonb_typeof("data"->'tokenHash') = 'string'
    AND "data"->>'tokenHash' ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("data"->'expiresAt') = 'string'
    AND "data"->>'expiresAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
  ) IS TRUE)
);
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" (("data"->>'tokenHash'));
CREATE INDEX "sessions_account_idx" ON "sessions" (("data"->>'accountId'));
CREATE INDEX "sessions_expiry_idx" ON "sessions" (("data"->>'expiresAt'));
COMMIT;
