import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
const action = process.argv[2];
const database = action === "test" ? "travelbuddy_refactor_test" : "postgres";
const url =
  action === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
function localSql(sql) {
  const r = spawnSync(
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
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const client = url ? new pg.Client({ connectionString: url }) : null;
if (client) await client.connect();
async function query(sql) {
  return client
    ? JSON.stringify((await client.query(sql)).rows)
    : localSql(sql);
}
try {
  if (action === "migrate") {
    for (const file of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      await query(
        `CREATE SCHEMA IF NOT EXISTS travelbuddy_private; CREATE TABLE IF NOT EXISTS travelbuddy_private.api_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON travelbuddy_private.api_migrations FROM PUBLIC,anon,authenticated;`,
      );
      const existing = await query(
        `SELECT name FROM travelbuddy_private.api_migrations WHERE name='${file}' AND checksum='${hash}'`,
      );
      if (existing !== "" && existing !== "[]") {
        console.log(`Already applied ${file}`);
        continue;
      }
      await query(
        `BEGIN; SELECT pg_advisory_xact_lock(741201660); ${sql}\nINSERT INTO travelbuddy_private.api_migrations(name,checksum) VALUES('${file}','${hash}'); COMMIT;`,
      );
      console.log(`Applied ${file}`);
    }
  } else if (action === "types") {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "supabase-meta",
        "node",
        "-e",
        `fetch('http://localhost:8080/generators/typescript?included_schemas=travelbuddy_api').then(async r=>{if(!r.ok)throw new Error(await r.text());process.stdout.write(await r.text())})`,
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(r.stderr);
    writeFileSync("src/types/database.ts", r.stdout);
    console.log("Generated database types");
  } else if (action === "test")
    console.log(await query(readFileSync("supabase/tests/api.sql", "utf8")));
  else throw new Error("Use migrate, types or test");
} finally {
  await client?.end();
}
