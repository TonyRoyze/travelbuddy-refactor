BEGIN;

ALTER TABLE "accounts"
  ADD COLUMN "profile_details" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_profile_details_object"
  CHECK (jsonb_typeof("profile_details") = 'object');

COMMIT;
