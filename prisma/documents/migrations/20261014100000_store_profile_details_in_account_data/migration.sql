BEGIN;

-- Profile details belong in the versioned account document. Preserve any values
-- written to the temporary column before removing the duplicate storage.
UPDATE "accounts"
SET "data" = jsonb_set("data", '{profileDetails}', "profile_details", true)
WHERE "profile_details" <> '{}'::jsonb
  AND "data"->'profileDetails' IS NULL;

ALTER TABLE "accounts" DROP COLUMN "profile_details";

COMMIT;
