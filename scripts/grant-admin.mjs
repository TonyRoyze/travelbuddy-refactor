import { parseArgs } from "node:util";
import pg from "pg";

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const usage = "Usage: node scripts/grant-admin.mjs (--email <email> | --account-id <uuid>) [--revoke]";

async function main() {
  let options;
  try {
    ({ values: options } = parseArgs({
      options: {
        email: { type: "string" },
        "account-id": { type: "string" },
        revoke: { type: "boolean", default: false },
      },
    }));
  } catch {
    throw new Error(usage);
  }

  const email = options.email?.trim();
  let accountId = options["account-id"];
  if ((options.email === undefined) === (accountId === undefined)
    || (options.email !== undefined && !email)
    || (accountId !== undefined && !uuidPattern.test(accountId))) {
    throw new Error(usage);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const client = new pg.Client({ connectionString });
  try {
    await client.connect();

    if (email) {
      const { rows } = await client.query(
        `SELECT a.id FROM travelbuddy_backend.accounts a
         JOIN auth.users u ON u.id = a.supabase_user_id
         WHERE lower(u.email) = lower($1) AND a.schema_version = 1
         LIMIT 2`,
        [email],
      );
      if (rows.length > 1) throw new Error("ambiguous_account");
      if (rows.length === 0) throw new Error("account_not_found");
      accountId = rows[0].id;
    }

    const { rows } = await client.query(
      "SELECT travelbuddy_private.set_account_admin($1::uuid, $2::boolean) AS roles",
      [accountId, !options.revoke],
    );
    console.log(JSON.stringify({ accountId, roles: rows[0].roles }));
  } catch (error) {
    if (error.code === "P0002" || error.message === "account_not_found") {
      throw new Error("No matching TravelBuddy account was found.", { cause: error });
    }
    if (error.message === "ambiguous_account") {
      throw new Error("Multiple accounts match that email. Use --account-id.", { cause: error });
    }
    throw new Error("Unable to update the administrator role. Check database access and migrations.", { cause: error });
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
