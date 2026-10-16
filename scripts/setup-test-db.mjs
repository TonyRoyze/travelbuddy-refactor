import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
const database = "travelbuddy_refactor_test";
function command(args, input) {
  const r = spawnSync("docker", args, { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}
const psql = (db, sql) =>
  command(
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
      db,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    sql,
  );
if (
  psql(
    "postgres",
    `SELECT 1 FROM pg_database WHERE datname='${database}'`,
  ).trim() === "1"
) {
  console.log("Disposable database already exists; leaving it intact.");
} else {
  command([
    "exec",
    "supabase-db",
    "createdb",
    "-U",
    "supabase_admin",
    database,
  ]);
  const dump = command([
    "exec",
    "supabase-db",
    "pg_dump",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-n",
    "travelbuddy_backend",
    "--no-owner",
    "--no-acl",
  ]);
  psql(database, dump);
  psql(
    database,
    `CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto SCHEMA extensions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated;
 DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['accounts','conversations','messages','booking_orders','scheduled_bookings','packages','media_assets'] LOOP EXECUTE format('DROP POLICY IF EXISTS api_executor_access ON travelbuddy_backend.%I',t);END LOOP;END $$;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    psql(
      database,
      "BEGIN;" +
        readFileSync("supabase/migrations/" + file, "utf8") +
        "COMMIT;",
    );
  console.log(
    "Created a disposable copy of the existing application schema and data. Auth uses test-only JWT helpers; the shared database was not modified.",
  );
}
