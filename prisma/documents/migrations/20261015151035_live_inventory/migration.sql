-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "schedule" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "booking_orders" (
    "id" UUID NOT NULL,
    "traveler_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_bookings" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "package_id" VARCHAR(80) NOT NULL,
    "option_index" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "travelers" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'confirmed',
    "total" DECIMAL(12,2) NOT NULL,
    "traveler_name" VARCHAR(120) NOT NULL,
    "traveler_email" VARCHAR(320) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_orders_traveler_id_created_at_idx" ON "booking_orders"("traveler_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_orders_traveler_id_idempotency_key_key" ON "booking_orders"("traveler_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_bookings_package_id_date_option_index_time_status_idx" ON "scheduled_bookings"("package_id", "date", "option_index", "time", "status");

-- CreateIndex
CREATE INDEX "scheduled_bookings_order_id_idx" ON "scheduled_bookings"("order_id");

-- AddForeignKey
ALTER TABLE "booking_orders" ADD CONSTRAINT "booking_orders_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "scheduled_bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "booking_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "scheduled_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON TABLE "booking_orders", "scheduled_bookings" FROM PUBLIC, anon, authenticated;
ALTER TABLE "booking_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scheduled_bookings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_access" ON "booking_orders" TO travelbuddy_app USING (true) WITH CHECK (true);
CREATE POLICY "backend_access" ON "scheduled_bookings" TO travelbuddy_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "booking_orders", "scheduled_bookings" TO travelbuddy_app;
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "booking_travelers_check" CHECK ("travelers" BETWEEN 1 AND 12);
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "booking_status_check" CHECK ("status" IN ('confirmed', 'cancelled'));
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "booking_total_check" CHECK ("total" >= 0);
ALTER TABLE "scheduled_bookings" ADD CONSTRAINT "booking_option_check" CHECK ("option_index" >= 0);
