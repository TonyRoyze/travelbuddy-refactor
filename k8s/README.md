# Kubernetes deployment

The app now connects to a separately provisioned self-hosted Supabase instance. See [Supabase setup](../docs/supabase-setup.md) for database roles, OAuth credentials, and callback URLs.

Create/update the `travelbuddy-secrets` Secret using your secret manager or local credentials file. Required values:

- `DOCUMENT_DATABASE_URL`: restricted application database connection.
- `DOCUMENT_MIGRATION_DATABASE_URL`: separate migration-owner connection.
- `SUPABASE_URL`: HTTPS address reachable from app pods and users.
- `SUPABASE_PUBLISHABLE_KEY`: instance publishable key.
- `AUTH_APP_URL`: `https://travelbuddy.shalinda.com`.

Google/Facebook/Apple client secrets belong to the Supabase Auth server configuration. The old `AUTH_SECRET` is no longer used. Keep development test accounts disabled in Kubernetes; `SUPABASE_SECRET_KEY` is not required by normal app login.

The workflow applies base resources, runs migrations, and deploys the app. Supabase infrastructure must already be running. The previous standalone Postgres manifest is retained for reference; the workflow does not deploy it. Existing database/PVC deletion requires a separate verified backup and cutover.

Your Mac's `localhost:8000` cannot serve the public app. Deploy Supabase to the server and configure HTTPS first, then update the secret and recreate app pods.
