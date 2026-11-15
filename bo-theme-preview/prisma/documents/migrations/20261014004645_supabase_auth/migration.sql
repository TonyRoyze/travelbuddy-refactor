BEGIN;

ALTER TABLE "accounts" ADD COLUMN "supabase_user_id" UUID;
CREATE UNIQUE INDEX "accounts_supabase_user_id_key" ON "accounts" ("supabase_user_id");

-- Supabase Auth owns identities and sessions. Existing migrations remain historical.
DROP TABLE "sessions";
DROP TABLE "auth_identities";

-- The application schema is not exposed through Supabase's Data API.
REVOKE ALL ON SCHEMA travelbuddy_backend FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA travelbuddy_backend FROM PUBLIC, anon, authenticated;

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "travel_requests" ENABLE ROW LEVEL SECURITY;

-- This login role is held only by the trusted Next.js server, which checks
-- Supabase identity, account status, role and conversation ownership per request.
CREATE POLICY "backend_access" ON "accounts" TO travelbuddy_app USING (true) WITH CHECK (true);
CREATE POLICY "backend_access" ON "conversations" TO travelbuddy_app USING (true) WITH CHECK (true);
CREATE POLICY "backend_access" ON "messages" TO travelbuddy_app USING (true) WITH CHECK (true);
CREATE POLICY "backend_access" ON "travel_requests" TO travelbuddy_app USING (true) WITH CHECK (true);

COMMIT;
