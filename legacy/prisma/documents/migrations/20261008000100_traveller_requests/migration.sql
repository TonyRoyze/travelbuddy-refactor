BEGIN;

CREATE TABLE "travel_requests" (
  "id" UUID NOT NULL PRIMARY KEY,
  "traveler_id" UUID NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" VARCHAR(120) NOT NULL,
  "destination" VARCHAR(120) NOT NULL,
  "details" VARCHAR(2000) NOT NULL,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "travel_requests_title_length" CHECK (char_length(btrim("title")) BETWEEN 3 AND 120),
  CONSTRAINT "travel_requests_destination_length" CHECK (char_length(btrim("destination")) BETWEEN 2 AND 120),
  CONSTRAINT "travel_requests_details_length" CHECK (char_length(btrim("details")) BETWEEN 10 AND 2000)
);
CREATE INDEX "travel_requests_traveler_id_created_at_id_idx" ON "travel_requests"("traveler_id", "created_at", "id");
CREATE INDEX "travel_requests_closed_created_at_id_idx" ON "travel_requests"("closed", "created_at", "id");

ALTER TABLE "conversations" ADD COLUMN "context_key" VARCHAR(36) NOT NULL DEFAULT 'direct';
ALTER TABLE "conversations" ADD COLUMN "request_id" UUID REFERENCES "travel_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_participant_pair_key";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_context_key_check"
  CHECK ("context_key" = COALESCE("request_id"::text, 'direct'));
CREATE UNIQUE INDEX "conversations_participant_one_id_participant_two_id_context_key_key"
  ON "conversations"("participant_one_id", "participant_two_id", "context_key");
CREATE INDEX "conversations_request_id_idx" ON "conversations"("request_id");

COMMIT;
