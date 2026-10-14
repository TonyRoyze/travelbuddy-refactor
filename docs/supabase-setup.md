# Self-hosted Supabase

TravelBuddy uses Supabase Auth and Supabase Postgres. Prisma still handles account, request, conversation, and message data. No cloud-specific database client is required.

## Install a local Supabase instance

Requires Git, Node.js 22+, pnpm 11, Docker Desktop (macOS/Windows) or Docker Engine (Linux), and Docker Compose 2.24.4 or later. Allocate at least 4 GB RAM to Docker; 8 GB is recommended for the full stack. Verify Docker is running with `docker run --rm hello-world`.

The existing local trial is already installed. For a fresh installation, run outside the TravelBuddy checkout:

```sh
mkdir -p ~/Code/supabase-trial
cd ~/Code/supabase-trial
git clone --depth 1 --branch self-hosted/v0.8.2 https://github.com/supabase/supabase
mkdir supabase-project
cp -R supabase/docker/. supabase-project/
cd supabase-project
cp .env.example .env
printf 'ref=self-hosted/v0.8.2\n' > .supabase-version
sh utils/generate-keys.sh --update-env
sh utils/add-new-auth-keys.sh --update-env
```

The release-tag checkout displays a normal detached-HEAD notice. The scripts write generated passwords and keys to `.env`; keep that file private and out of Git. Do not run the key-generation scripts again on an existing installation unless intentionally rotating credentials.

Copy the included local override beside Supabase's Compose file (adjust the TravelBuddy checkout path if necessary):

```sh
cp ~/Code/travelbuddy/infra/supabase/docker-compose.travelbuddy.yml .
```

Edit the **Supabase server** `.env`, keeping the generated keys and passwords. Set:

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.travelbuddy.yml
SUPABASE_PUBLIC_URL=http://localhost:8000
API_EXTERNAL_URL=http://localhost:8000/auth/v1
SITE_URL=http://localhost:3000
ADDITIONAL_REDIRECT_URLS=http://localhost:3000/auth/callback
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
DISABLE_SIGNUP=false
GOOGLE_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_SECRET=
FACEBOOK_ENABLED=false
FACEBOOK_CLIENT_ID=
FACEBOOK_SECRET=
APPLE_ENABLED=false
APPLE_CLIENT_ID=
APPLE_SECRET=
```

Email verification is off for this local trial, so registration needs no mail server. Enable Google later using the credentials section below.

The override binds gateway/database ports to localhost, passes OAuth variables into Auth, and shares a named Docker volume between Storage and imgproxy. The named volume avoids macOS bind-mount limitations. It uses Compose's [`!override` merge tag](https://docs.docker.com/reference/compose-file/merge/#replace-value) to replace the public port mappings completely. The stack's base `docker-compose.yml` does not need manual edits.

```sh
docker compose config --quiet
docker compose pull
sh run.sh start
docker compose ps
```

All services should become healthy. Open http://localhost:8000 for Studio. Sign in with `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` from the Supabase server `.env`.

## Starting and stopping the existing instance

Start Docker Desktop, then:

```sh
cd ~/Code/supabase-trial/supabase-project
sh run.sh start
# Stop while preserving database and uploaded files:
sh run.sh stop
```

Use `sh run.sh logs auth` to inspect Auth startup problems. Avoid `reset.sh` and `docker compose down -v` unless intentionally deleting data. This localhost setup is a local trial; it cannot serve the public Kubernetes app.

## Bootstrap a new instance

The current local trial is already bootstrapped. For a **new** Supabase instance, create the application and migration roles once before deploying migrations. From the Supabase Docker directory, using the checkout path for the SQL file:

```sh
APP_DB_PASSWORD="$(openssl rand -hex 32)"
MIGRATION_DB_PASSWORD="$(openssl rand -hex 32)"
docker compose exec -T db psql -U supabase_admin -d postgres \
  -v app_password="$APP_DB_PASSWORD" \
  -v migration_password="$MIGRATION_DB_PASSWORD" \
  < ~/Code/travelbuddy/scripts/bootstrap-supabase.sql
```

Save both generated passwords securely and use them in the corresponding app environment connections. The pooler username is `<role>.<POOLER_TENANT_ID>`; get the tenant ID from the Supabase server `.env`. Keep this schema out of `PGRST_DB_SCHEMAS`.

## App configuration

Copy `.env.example` to `.env.local` and set the connections and keys. The existing local trial is already configured. For a new checkout, replace the connection placeholders in `.env.local` using the passwords from bootstrap and keys from the Supabase server `.env`:

- `DOCUMENT_DATABASE_URL`: restricted `travelbuddy_app.<tenant>` login on the session pooler, port 5432, database `postgres`, query `schema=travelbuddy_backend`.
- `DOCUMENT_MIGRATION_DATABASE_URL`: separate `travelbuddy_migrator.<tenant>` schema owner. Required for migration deployment.
- `SUPABASE_URL`: `http://localhost:8000`.
- `SUPABASE_PUBLISHABLE_KEY`: from the Supabase server `.env`.
- `AUTH_APP_URL`: `http://localhost:3000`.
- `SUPABASE_SECRET_KEY`: server-only; needed only for development test accounts.

Use the session pooler for migrations and Prisma. Do not use the transaction pooler (6543) for migrations. When connecting to Postgres directly, use the bare role name without the tenant suffix.

```sh
pnpm install --frozen-lockfile
pnpm db:documents:deploy
pnpm dev
```

Restart the app after changing environment variables.

## Email and password

Login and registration also accept an email address and password through Supabase Auth. New passwords require at least eight characters. Passwords pass through the TravelBuddy server to Supabase Auth; they are never stored in application documents or browser storage. Sessions use the same private cookies as social sign-in. New accounts continue to the Traveller/Buddy registration screen.

For this local trial, `ENABLE_EMAIL_SIGNUP=true` and `ENABLE_EMAIL_AUTOCONFIRM=true` in the Supabase server `.env`; registration signs in immediately without a verification email. If email confirmation is enabled later, configure SMTP and set `ENABLE_EMAIL_AUTOCONFIRM=false`; the app supports the confirmation callback and displays a check-your-email message.

After changing these settings, run `sh run.sh recreate auth` from the Supabase Docker directory. Run `pnpm test:email:http` against the running local app to check signup, sign-in, role onboarding, and session security. The test creates and deletes a temporary local user and expects verification to be off.

## OAuth credentials and callbacks

Supabase generates database passwords, JWT signing keys, and API keys. It does **not** generate Google, Facebook, or Apple credentials. The old `AUTH_SECRET` is no longer used.

There are two callbacks:

1. OAuth provider → Supabase: `http://localhost:8000/auth/v1/callback` locally, or `https://SUPABASE_DOMAIN/auth/v1/callback` on a server.
2. Supabase → TravelBuddy: `http://localhost:3000/auth/callback` locally, or `https://APP_DOMAIN/auth/callback` on a server.

In the Supabase server `.env`, set `SITE_URL` to the app origin and include the exact app callback in `ADDITIONAL_REDIRECT_URLS`. The included Compose override passes all three providers' environment variables through to the Auth service. Adding values to `.env` alone does not enable a provider without that mapping.

### Google

Create or open a **Web application** OAuth client in Google Cloud Console → APIs & Services → Credentials. Obtain both the client ID and client secret. Register the Supabase callback as an authorized redirect URI. Add testing users if your consent screen is in testing mode.

Set in the **Supabase server** `.env`:

```dotenv
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=your-google-web-client-id
GOOGLE_SECRET=your-google-client-secret
```

This redirects through Supabase; it replaces the previous Google Identity Services ID-token flow, which needed only a client ID.

### Facebook

Create a Meta developer app with Facebook Login, obtain the app ID and secret, and register the Supabase callback as a valid OAuth redirect URI. Use a public HTTPS callback for deployment; follow Meta's current local-development restrictions. Until the app is live, sign-in is limited to the app's permitted development/test users.

```dotenv
FACEBOOK_ENABLED=true
FACEBOOK_CLIENT_ID=your-facebook-app-id
FACEBOOK_SECRET=your-facebook-app-secret
```

### Apple

Requires an Apple Developer account, an App ID with Sign in with Apple, a Services ID for web sign-in, and a Sign in with Apple key. Register a real HTTPS domain and callback; Apple web callbacks cannot use localhost or an IP address. Use a stable HTTPS development domain or deploy the Supabase instance before enabling this provider.

The client secret is a JWT signed with your Apple private key, **not** an arbitrary random string. It expires after at most six months and must be rotated.

```dotenv
APPLE_ENABLED=true
APPLE_CLIENT_ID=your-apple-services-id
APPLE_SECRET=your-signed-apple-client-secret-jwt
```

After changing any provider configuration:

```sh
cd ~/Code/supabase-trial/supabase-project
sh run.sh recreate auth
```

The app reads `/auth/v1/settings` to show available providers. Unconfigured options stay disabled and display “Coming soon”; OAuth errors return to the login page without exposing provider tokens or diagnostic details.

## Auth and access control

- OAuth starts with a same-origin POST, uses PKCE, and exchanges the code on the server. Session and verifier cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS.
- Middleware refreshes Supabase sessions and returns private/no-store cache headers. Protected handlers verify users with `getUser()`; browser-supplied session payloads are never trusted.
- Supabase user IDs map uniquely to application accounts. Names can come from social profile metadata, but new accounts begin as travellers. During first registration, users may select Traveller or Buddy (the internal `provider` role). Completed accounts cannot change roles by replaying registration, and guide/admin roles cannot be selected. Roles are stored in the private backend. Roles/status are checked for each request.
- The private `travelbuddy_backend` schema is not exposed in PostgREST. `anon`/`authenticated` have no schema/table access. RLS allows only the restricted server application role; server routes enforce ownership and role rules.
- The migration role owns schema changes. Runtime credentials cannot create/drop tables or access Supabase Auth tables. Neither key nor connection credentials go into public environment variables. The application role also cannot edit Prisma migration metadata.
- Supabase owns session revocation. As with other JWT systems, already-issued access tokens have a limited lifetime; do not promise that signing out instantly invalidates every stolen token.

Historical Prisma migrations are retained. The new migration removes the old custom identity/session tables; this cutover starts with an empty local database. No existing accounts or messages are imported.

## Development test accounts

Default: disabled. To enable the existing `/test-accounts` screen locally, set `TEST_ACCOUNTS_ENABLED=true` and `TEST_ACCOUNT_DATABASE_HOST=127.0.0.1`, with a matching database URL and localhost Supabase URL. The route is unavailable outside development and rejects non-local requests. It creates local Supabase test users; there is no custom authentication bypass.

## Validation

```sh
pnpm typecheck
pnpm test
pnpm test:documents
pnpm test:auth
pnpm build
# With the local app running and Google enabled:
pnpm test:auth:http
```

Database/Auth/inbox integration scripts require `DOCUMENT_TEST_DATABASE_URL` pointing at a separate migrated disposable database. Auth integration also uses the local Supabase admin key to create and delete temporary Auth users. Do not run against production infrastructure.

## Kubernetes

Provision Supabase separately and give it a public HTTPS URL. Localhost on your Mac is not reachable from Kubernetes pods or remote users. Set production callback URLs, OAuth credentials, backups, SMTP, and monitoring on the Supabase host.

The app's deployment secret needs `DOCUMENT_DATABASE_URL`, `DOCUMENT_MIGRATION_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `AUTH_APP_URL`. Do not enable development test accounts in production. The app pod receives only runtime values; the migration job receives only the migration connection. Apply migrations with the migration job, then deploy the app. The workflow no longer provisions the old standalone Postgres StatefulSet. Do not delete an existing StatefulSet/PVC until its data is backed up and the cutover is verified.

References: [Docker installation](https://supabase.com/docs/guides/self-hosting/docker), [self-hosted OAuth](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth), [SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple).
