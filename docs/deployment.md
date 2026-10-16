# Deployment and compatibility

## Personal server

Keep the existing self-hosted Supabase Docker deployment and its persisted database/storage volumes. The frontend builds to static files:

```sh
pnpm install --frozen-lockfile
VITE_SUPABASE_URL=https://supabase.example.com VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY pnpm build
```

Serve `dist/` through Caddy or Nginx over HTTPS with SPA fallback to `index.html` for non-file paths. For Nginx, use `try_files $uri $uri/ /index.html;`. Cache content-hashed assets for a year with `immutable`, and serve `index.html` with revalidation. Vite's development server is not a production web server. Public environment settings are compiled into the bundle; rebuild when the Supabase origin changes.

Apply SQL migrations with a Supabase administrator that can create roles and grant existing-table privileges before deploying frontend assets. Preserve the private backend schema and existing server application role. Never edit applied migration files: add a new migration. Keep the legacy Prisma migration history intact. This branch's additive migrations assume the existing application schema is already present; they do not bootstrap an empty Supabase database.

Expose `travelbuddy_api` through PostgREST, add the deployed app's exact callback URLs to Auth, and install the `media-url` Edge Function in the server's shared functions volume. Keep both app callback origins during migration. The Edge Function rewrites internal storage URLs to `SUPABASE_PUBLIC_URL`, so that value must match the externally reachable Supabase origin. Retain HTTPS, mail delivery configuration for password recovery, database backups, and Storage backups.

No Spring Boot service is needed for the current scope. When migrating media uploads, move server-side ffprobe validation into a dedicated service rather than trusting browser-reported file metadata.

## Authorization model

The exposed schema contains security-invoker RPC wrappers and no tables. Private security-definer implementations run as a dedicated NOLOGIN, NOBYPASSRLS role with limited application-table privileges. Every private write checks the verified Supabase identity and relevant account, ownership, membership, or role constraints. They use fixed search paths and explicit execution grants. Browser metadata cannot grant roles. Direct private-table access remains revoked for anon/authenticated.

The new app uses normal browser-managed Supabase sessions and PKCE. The old app continues using its existing HttpOnly session cookies. Already issued JWTs retain Supabase's normal expiry behavior; account status is checked on protected RPC calls.

Booking mutations take the same package row locks, in the same sorted order, as the legacy server. A transaction-scoped advisory lock also serializes retries with the same traveler/idempotency key. The fingerprint reproduces the legacy checkout JSON serialization. Existing records, account revisions, conversation context keys, and booking snapshots remain compatible.

## Operational checks

Run the local test suite and disposable database suites before each API deployment. Inspect `docker compose logs rest auth functions` for API/auth/function failures. Never log access tokens or signing keys. The migration journal records deployed checksums. To roll back the frontend, serve its previous static build; additive schemas can remain while the old app continues running.

OAuth verification requires the provider's real browser flow; email recovery delivery requires working SMTP. Keep provider secrets and all database/storage administration credentials on the Supabase host only.

## Implementation verification — 16 October 2026

- Type checking, ESLint, formatting, 12 unit tests, and the Vite production build pass.
- Disposable-database tests cover anonymous access, private-table isolation, account status, onboarding/role protection, time-slot filtering, sold-out/closed dates, server pricing, checkout replay/conflicts, cancellation, and participant-only messages.
- Compatibility tests execute the original server implementation alongside the new SQL API: checkout fingerprints/retries, cancellation, a race for the final available places, thread reuse, and shared messages pass.
- Headless browser testing covers email registration, onboarding, signed listing media, pre-booking chat, the booking return link, checkout/reload, confirmation, cancellation, password update, token refresh, logout/login, search, and mobile/desktop layouts. The original HTTP bookings endpoint reads the new reservation successfully. Private historical media remains accessible to its booked traveler and is denied to anonymous users after unpublishing.
- Supabase's security advisor reports no issues. Both additive migrations are applied locally, and rerunning the migration runner skips them.
- Browser verification created unique temporary accounts, a package, messages, a booking, and an uploaded image; all those fixtures were removed. Existing records were preserved.

Google sign-in is configured and its button is visible, but completing the external Google login was not automated. Password-update and session flows were exercised; delivery of recovery email through SMTP was not verified.
