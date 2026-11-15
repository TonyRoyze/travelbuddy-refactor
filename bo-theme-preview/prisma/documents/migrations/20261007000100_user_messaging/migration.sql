BEGIN;

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "participant_one_id" UUID NOT NULL,
  "participant_two_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_distinct_participants" CHECK ("participant_one_id" <> "participant_two_id"),
  CONSTRAINT "conversations_participant_one_fkey" FOREIGN KEY ("participant_one_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversations_participant_two_fkey" FOREIGN KEY ("participant_two_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversations_participant_pair_key" UNIQUE ("participant_one_id", "participant_two_id")
);

CREATE INDEX "conversations_participant_one_updated_at_idx" ON "conversations"("participant_one_id", "updated_at");
CREATE INDEX "conversations_participant_two_updated_at_idx" ON "conversations"("participant_two_id", "updated_at");

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_distinct_sender_recipient" CHECK ("sender_id" <> "recipient_id"),
  CONSTRAINT "messages_body_trimmed_length" CHECK (char_length("body") BETWEEN 1 AND 1000 AND "body" = btrim("body")),
  CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "messages_conversation_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");
CREATE INDEX "messages_sender_id_created_at_idx" ON "messages"("sender_id", "created_at");
CREATE INDEX "messages_recipient_id_created_at_idx" ON "messages"("recipient_id", "created_at");

COMMIT;
