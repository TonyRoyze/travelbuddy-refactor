# Deployment and compatibility

## k3s namespace reset

The Vite app's namespace manifest is [k8s/namespace.yaml](../k8s/namespace.yaml). To replace the old `travelbuddy` namespace from a machine with authorized cluster access, delete and recreate it:

```sh
kubectl delete namespace travelbuddy
kubectl wait --for=delete namespace/travelbuddy --timeout=2m
kubectl apply -f k8s/namespace.yaml
```

Deleting a namespace removes all namespaced workloads, Secrets, PVCs, and other resources in it. Supabase is in the separate `supabase` namespace and is not included. This workspace has no configured kubectl context, so the reset has not been run.

## Personal server

Keep the existing self-hosted Supabase Docker deployment and its persisted database/storage volumes. The frontend builds to static files:

```sh
pnpm install --frozen-lockfile
PUBLIC_SITE_URL=https://travel.example.com VITE_SUPABASE_URL=https://supabase.example.com VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY pnpm build
```

Serve `dist/` through Caddy or Nginx over HTTPS with SPA fallback to `index.html` for non-file paths. For Nginx, use `try_files $uri $uri/ /index.html;`. Cache content-hashed assets for a year with `immutable`, and serve `index.html` with revalidation. Vite's development server is not a production web server. Public environment settings are compiled into the bundle; rebuild when the Supabase origin changes.

Apply SQL migrations with a Supabase administrator that can create roles and grant existing-table privileges before deploying frontend assets. Preserve the private backend schema and existing server application role. Never edit applied migration files: add a new migration. Keep the legacy Prisma migration history intact. This branch's additive migrations assume the existing application schema is already present; they do not bootstrap an empty Supabase database.

Expose `travelbuddy_api` through PostgREST, add the deployed app's exact callback URLs to Auth, and install the `media-url` Edge Function in the server's shared functions volume. Keep both app callback origins during migration. The Edge Function rewrites internal storage URLs to `SUPABASE_PUBLIC_URL`, so that value must match the externally reachable Supabase origin. Retain HTTPS, mail delivery configuration for password recovery, database backups, and Storage backups.

Run the Node media service with ffprobe and the Node payment service alongside the static site. Proxy `/profile-media/` and `/payments-api/` to their private ports. See [profile service deployment](profile-parity.md) and [PayHere/refund and Facebook configuration](vidura-marketplace-features.md).

## Single-node k3s deployment

The app can run as a stateless web/API pod on one k3s node. The existing Supabase/Postgres deployment remains the stateful system of record and must keep its own persistent volumes and backups. A single node has no node-level failover: a node or disk failure takes both the app and any colocated database offline, so this layout suits an internal pilot or low-traffic service with tested backups and restore steps.

The Deployment uses one replica and `maxSurge: 0` so an update fits on a resource-constrained node. It has startup, readiness and liveness probes, a graceful shutdown window, non-root execution, a read-only container filesystem, a bounded temporary volume, and explicit CPU/memory requests and limits. Readiness checks that the media and payment processes started; liveness checks the parent process without restarting it during a temporary database outage. This reduces bad rollouts and restart loops while respecting the node's resource budget.

Before applying `k8s/deployment.yaml`, replace the app hostname and image tag, and set the `travelbuddy-runtime` Secret in the `travelbuddy` namespace. The required keys are `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`; `SUPABASE_STORAGE_SECRET_KEY` is optional. Keep PayHere merchant credentials unset for browsing and pay-on-arrival only, or supply them as Kubernetes Secret keys after sandbox verification. Use an existing TLS ingress controller and expose HTTPS at the same origin entered in `MEDIA_ALLOWED_ORIGINS`, `PAYMENTS_SITE_URL` and `PAYMENTS_CALLBACK_URL`. Route `https://<app-host>/payments-api/notify` to the app service so PayHere can reach the callback. Restrict any ingress to the intended internal or public audience and allow the configured Supabase URL from the pod.

The publish workflow now runs dependency installation, type checking, lint, unit tests and a production build before it pushes the image. Configure repository variables `SUPABASE_PUBLISHABLE_KEY` and `PUBLIC_SITE_URL`. It publishes `ghcr.io/<owner>/<repository>:<commit-sha>`; the deployment image reference must use that exact repository and commit SHA. If the package is private, configure an image pull Secret. Apply database migrations as an administrator before deploying a frontend image that uses them. Migrations are additive and require the existing TravelBuddy Supabase schema; they do not initialize an empty database.

For a controlled rollout, build and push from the protected main branch, confirm the workflow checks pass, apply the additive migrations, then update the image and wait for `kubectl rollout status deployment/travelbuddy -n travelbuddy`. Check `/readyz`, the payment/media service logs, and a real sandbox payment and callback before enabling live payment credentials. A single replica has a brief interruption during image updates and does not protect against node failure. Do not run a namespace reset as part of application deployment.

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

## Chat Realtime

Apply `20261107091557_realtime_messages.sql` with `pnpm db:migrate` before rolling out the frontend. Supabase Realtime must be running and reachable through the gateway's WebSocket route. The migration uses the installed `realtime.send`, `realtime.topic`, and `realtime.messages` APIs; it does not expose the backend schema through PostgREST or Postgres Changes.

Message inserts and updates emit private `changed` broadcasts to `chat:<supabase-user-id>` for both conversation participants. Notifications carry only a conversation ID. A SELECT policy allows authenticated users to receive their own topic; the application does not grant clients broadcast INSERT access. Message content and attachments are fetched through the existing authorized RPCs. Inbox subscriptions refresh message history, conversation previews and unread counts; reconnecting refetches to recover missed notifications. The provider dashboard also listens for these notifications while retaining its booking refresh interval.

After migration, verify with two signed-in participants in separate sessions: incoming text, attachments and shared experiences should appear without refresh, unread counts should update, and a message sent during a disconnected session should appear after reconnection. A third user must be unable to subscribe to either participant's private topic. Database and WebSocket integration checks require a running Supabase instance.
