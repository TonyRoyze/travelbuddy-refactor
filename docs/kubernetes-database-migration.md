# Moving the database to Kubernetes

The app is designed to use PostgreSQL through one setting: `DOCUMENT_DATABASE_URL`. Prisma and the versioned SQL migrations define the database structure. To move from Neon to PostgreSQL in your Kubernetes cluster, provision a compatible PostgreSQL database, copy the `travelbuddy_backend` schema, and point the app at the cluster's PostgreSQL service.

## What the app needs

- PostgreSQL 16 or later.
- A database and application role with permissions to read and write the `travelbuddy_backend` schema.
- `DOCUMENT_DATABASE_URL` available to the Next.js server pods. It must contain exactly one `schema=travelbuddy_backend` parameter.
- The existing migrations under `prisma/documents/migrations` for future schema changes.

The app does not require Neon APIs, Neon Auth, or Neon Object Storage to connect to PostgreSQL. Google sign-in separately needs `GOOGLE_CLIENT_ID`, `AUTH_APP_URL`, and `AUTH_SECRET`. The current Neon buckets are not used by the app's code, so they do not need to be migrated for the current functionality.

## Prepare the Kubernetes database

1. Provision PostgreSQL 16+ with persistent storage, backups, and a tested restore process. Create an application database and least-privilege role. Keep PostgreSQL reachable from the app namespace through an internal Service.
2. From the app namespace, the service address usually looks like `postgres-rw.<database-namespace>.svc.cluster.local`. Use the Service name provided by your PostgreSQL operator or chart.
3. Build the Prisma connection URL using that internal host. URL-encode special characters in the username and password:

   ```text
   postgresql://travelbuddy_app:<password>@postgres-rw.database.svc.cluster.local:5432/travelbuddy?schema=travelbuddy_backend
   ```

   The `schema` parameter is required by this app. Use the cluster's TLS settings if PostgreSQL requires TLS.

## Copy existing data from Neon

Schedule a short maintenance window so writes do not happen during the final copy. Use Neon’s direct, unpooled PostgreSQL URL for the dump. For `pg_dump`, use a PostgreSQL connection URL without Prisma's `schema` query parameter; select the schema with `--schema` instead. Keep both connection URLs in environment variables or a secure secret manager, never in source control or shared logs.

Create a custom-format dump of the app schema:

```bash
pg_dump --format=custom --schema=travelbuddy_backend --no-owner --no-acl \
  --dbname="$NEON_DIRECT_PG_URL" --file=travelbuddy-backend.dump
```

Restore it into the new, empty Kubernetes database. Use a direct PostgreSQL URL without `schema=...` for the restore target:

```bash
pg_restore --no-owner --no-acl --dbname="$KUBERNETES_DIRECT_PG_URL" \
  travelbuddy-backend.dump
```

Then set `DOCUMENT_DATABASE_URL` to the Kubernetes app URL shown above and run `pnpm db:documents:deploy`. If the dump included the Prisma migration history, this should report no pending migrations. Do not run `prisma db push` for this backend.

If there is no data to preserve, skip the dump and restore, set `DOCUMENT_DATABASE_URL` to the empty Kubernetes database, and run `pnpm db:documents:deploy` to create the schema.

## Configure and roll out the app

Put `DOCUMENT_DATABASE_URL`, `GOOGLE_CLIENT_ID`, `AUTH_APP_URL`, and `AUTH_SECRET` in a Kubernetes Secret or an external secret manager. Do not add these values to the container image, ConfigMap, or Git. Inject them into the Next.js server pods as environment variables.

Run `pnpm db:documents:deploy` once as a release job using the same application image and Kubernetes Secret, before rolling out pods that expect the new schema. Do not run migrations independently from every replica at startup. Once the migration job succeeds, update the Deployment and roll out the app using the Kubernetes URL.

Before ending maintenance, verify that the app can sign in, read the account, create/read a session, and log out. After confirming the new database is serving traffic and has backups, keep the Neon database untouched for a short rollback window. Rollback by changing `DOCUMENT_DATABASE_URL` only before new writes occur on Kubernetes; after writes diverge, switching back alone would lose those writes.

## Routine schema changes

For each release that changes the database, add a versioned SQL migration under `prisma/documents/migrations`, test it on a disposable PostgreSQL database, then run `pnpm db:documents:deploy` once against the Kubernetes database before app rollout. The same migration files work with Neon and standard PostgreSQL.
