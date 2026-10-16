ALTER TABLE "conversations" ADD COLUMN "package_id" VARCHAR(80);
CREATE INDEX "conversations_package_id_idx" ON "conversations"("package_id");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
