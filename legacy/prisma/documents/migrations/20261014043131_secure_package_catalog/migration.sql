BEGIN;
REVOKE ALL ON TABLE "packages" FROM PUBLIC, anon, authenticated;
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_access" ON "packages" TO travelbuddy_app USING (true) WITH CHECK (true);
COMMIT;
