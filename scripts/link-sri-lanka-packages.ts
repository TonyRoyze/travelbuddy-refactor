import { spawnSync } from "node:child_process";
// Local development data only; preserves existing ownership and historical bookings.
const buddyId = process.argv[2] ?? "3f7f9592-fc5d-4ced-8c1e-5a19610638d9";
if (!/^[0-9a-f-]{36}$/i.test(buddyId))
  throw new Error("Pass a Buddy account UUID.");
const result = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "supabase-db",
    "psql",
    "-X",
    "-qAt",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    encoding: "utf8",
    input: `
BEGIN;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.accounts WHERE id='${buddyId}'::uuid AND supabase_user_id IS NOT NULL AND data->>'status'='active' AND data->>'onboarding'='completed' AND data->'roles' ?| ARRAY['provider','guide']) THEN RAISE EXCEPTION 'Choose an active, completed Buddy account'; END IF; END $$;
WITH linked AS (
 UPDATE travelbuddy_backend.packages p SET owner_id=a.id,
 data=p.data||jsonb_build_object('supplier',a.data->>'displayName'),updated_at=clock_timestamp()
 FROM travelbuddy_backend.accounts a WHERE a.id='${buddyId}'::uuid AND p.owner_id IS NULL AND lower(trim(p.country))='sri lanka'
 RETURNING p.id
) SELECT 'Linked '||count(*)||' Sri Lankan packages to the Buddy account.' FROM linked;
COMMIT;
`,
  },
);
if (result.status !== 0) throw new Error(result.stderr);
console.log(result.stdout.trim());
