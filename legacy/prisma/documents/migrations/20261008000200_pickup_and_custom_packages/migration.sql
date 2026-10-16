BEGIN;
ALTER TABLE "travel_requests" ADD COLUMN "pickup_location" VARCHAR(200);
ALTER TABLE "travel_requests" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "travel_requests" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "travel_requests" ADD CONSTRAINT "travel_requests_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND "pickup_location" IS NOT NULL)
);
CREATE INDEX "travel_requests_open_coordinates_idx" ON "travel_requests" ("latitude", "longitude") WHERE NOT "closed" AND "latitude" IS NOT NULL;
ALTER TABLE "messages" ADD COLUMN "package" JSONB;
ALTER TABLE "messages" ADD CONSTRAINT "messages_package_object_check" CHECK ("package" IS NULL OR jsonb_typeof("package") = 'object');
COMMIT;
