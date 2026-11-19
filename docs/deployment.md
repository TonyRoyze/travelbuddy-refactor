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

For a controlled rollout, build and push from the protected `dev` production branch, confirm the workflow checks pass, apply the additive migrations, then update the image and wait for `kubectl rollout status deployment/travelbuddy -n travelbuddy`. Check `/readyz`, the payment/media service logs, and a real sandbox payment and callback before enabling live payment credentials. A single replica has a brief interruption during image updates and does not protect against node failure. Do not run a namespace reset as part of application deployment.

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
## Buddy applications

Apply the buddy application migration with `pnpm db:migrate` before rolling out the app. The signup sends images to the existing Supabase Data API in a single request. Allow at least 17 MiB per request on the Supabase gateway path for the maximum six 2 MiB images after base64 encoding. Test with sample documents through the deployed gateway before accepting real applications.

Use a trusted database operator session to review applications. Only expose `travelbuddy_api` through PostgREST. The private tables and decision function are inaccessible to browser and service-role API requests.

```sql
SELECT account_id, submitted_at, details
FROM travelbuddy_private.buddy_applications
WHERE status = 'pending'
ORDER BY submitted_at;

-- Read only the evidence for the application being reviewed.
SELECT kind, mime_type, content
FROM travelbuddy_private.buddy_application_images
WHERE account_id = '<account UUID>';
```

Open the evidence in a trusted image viewer. Compare the submitted details and selfie with the ID, check the applicant is 18 or older, and contact the applicant if the photo match or document is unclear. Review the SLTDA licence or the driver and vehicle credentials when applicable. This workflow uses human review. It does not call the Sri Lankan NIC registry, send OTPs or run biometric liveness checks.

Use the exact `submitted_at` from the pending row when recording the decision so a stale review cannot approve a replacement submission.

```sql
SELECT travelbuddy_private.review_buddy_application(
  '<account UUID>', '<submitted_at>', true, '<operator identifier>'
);

-- Or request changes with a message the applicant will see.
SELECT travelbuddy_private.review_buddy_application(
  '<account UUID>', '<submitted_at>', false, '<operator identifier>',
  'Please submit a clearer photograph of your identity document.'
);
```

Both decisions remove the submitted images and private application details from live tables. Use the changes request to close applications that have exceeded the operator's retention window. Review backup retention separately and remove any temporary local review copies. Approval activates hosting and copies the display name, home base, languages and introduction to the buddy profile.

Existing buddies can open **Account → Buddy registration** and submit an application for review. Their account role and public profile remain in place during and after review.

### Azure Face comparison

For applicants who choose Azure Face comparison, a trusted database operator can compare the submitted ID portrait and selfie before recording the manual decision. Use an Azure Face resource approved for limited-access face verification. Keep the resource endpoint, key and database credentials on the operator machine. The command reads the two private images and prints the comparison and submission timestamp. A comparison does not change the application or determine its outcome. It does not test whether the selfie was taken live.

```sh
# Set DATABASE_URL, AZURE_FACE_ENDPOINT and AZURE_FACE_KEY in the operator environment first.
node scripts/check-buddy-face.mjs <account-uuid>
```
