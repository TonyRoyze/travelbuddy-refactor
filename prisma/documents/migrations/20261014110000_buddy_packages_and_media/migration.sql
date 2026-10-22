-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "owner_id" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "storage_path" VARCHAR(200) NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_path_key" ON "media_assets"("storage_path");

-- CreateIndex
CREATE INDEX "media_assets_owner_id_created_at_idx" ON "media_assets"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "packages_owner_id_updated_at_idx" ON "packages"("owner_id", "updated_at");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- All application records remain behind the private backend API.
REVOKE ALL ON TABLE "media_assets" FROM PUBLIC, anon, authenticated;
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_access" ON "media_assets" TO travelbuddy_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media_assets" TO travelbuddy_app;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_size_check" CHECK ("bytes" > 0 AND "bytes" <= 26214400);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_duration_check" CHECK ("duration_seconds" IS NULL OR ("duration_seconds" > 0 AND "duration_seconds" <= 60));
