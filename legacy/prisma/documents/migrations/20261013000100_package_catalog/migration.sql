CREATE TABLE "packages" (
    "id" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "destination" VARCHAR(120) NOT NULL,
    "country" VARCHAR(120) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER NOT NULL,
    "duration" VARCHAR(80) NOT NULL,
    "free_cancellation" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "packages_price_check" CHECK ("price" >= 0),
    CONSTRAINT "packages_rating_check" CHECK ("rating" >= 0 AND "rating" <= 5),
    CONSTRAINT "packages_duration_check" CHECK ("duration_minutes" > 0),
    CONSTRAINT "packages_data_check" CHECK (jsonb_typeof("data") = 'object')
);

CREATE INDEX "packages_published_destination_idx" ON "packages"("published", "destination");
CREATE INDEX "packages_published_category_idx" ON "packages"("published", "category");
CREATE INDEX "packages_published_price_idx" ON "packages"("published", "price");
CREATE INDEX "packages_published_rating_idx" ON "packages"("published", "rating");
CREATE INDEX "packages_published_sort_order_idx" ON "packages"("published", "sort_order");
CREATE INDEX "packages_published_duration_minutes_idx" ON "packages"("published", "duration_minutes");
CREATE INDEX "packages_published_free_cancellation_idx" ON "packages"("published", "free_cancellation");
