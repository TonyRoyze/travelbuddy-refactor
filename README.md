# TravelBuddy

A React + Vite application backed by the existing self-hosted Supabase instance. The earlier Next.js implementation is also preserved under [`legacy/`](legacy/) so both apps can be run from this branch.

## Run locally

Requires Node 22.12+ (or Node 24+), pnpm 11, and the existing local Supabase Docker stack.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
pnpm dev
```

Open http://localhost:5173. The legacy Next.js app can run independently on port 3000; see [`docs/development-guide.md`](docs/development-guide.md). Browser sessions and the original app's HttpOnly cookies are separate; both map to the same Auth identities and application accounts.

## Database and API setup

The application tables remain in the private `travelbuddy_backend` schema. Apply the additive migrations once:

```sh
pnpm db:migrate
pnpm db:types
```

The default migration runner uses `docker exec` against the existing `supabase-db` container, database `postgres`. It records migration filenames and checksums in a private journal. For another host, supply a Supabase administrator `DATABASE_URL` (role creation and existing-table grant privileges are required) to `db:migrate`. Keep it out of frontend environment variables. The type generator uses the existing `supabase-meta` container; for a remote host use `pnpm exec supabase gen types --db-url "$DATABASE_URL" --schema travelbuddy_api > src/types/database.ts`.

In the existing Supabase server configuration, append `travelbuddy_api` to `PGRST_DB_SCHEMAS`. Retain `public,graphql_public` and keep `travelbuddy_backend` unexposed. Add `http://localhost:5173/auth/callback` and `http://localhost:5173/reset-password` to `ADDITIONAL_REDIRECT_URLS` without removing port 3000 callbacks. Recreate the `rest` and `auth` services after changes. These changes have been applied to the current local instance.

Copy `supabase/functions/media-url` into the existing Supabase `volumes/functions/` directory and restart its functions service. This is already installed locally. The function uses the existing server-side Auth and Storage keys and returns five-minute signed media URLs only after the caller-scoped RPC authorizes the reference. Public listing media remains available to signed-out visitors.

Never use `supabase db reset` or remove Docker volumes on this shared instance.

## Code organization

- `src/routes`: file routes, validated URL search parameters, and protected layouts. TanStack's Vite plugin generates `routeTree.gen.ts` and splits route components into lazy chunks.
- `src/features`: auth, account, catalog, booking, and messaging components and types.
- `src/components/ui`: shadcn components using Base UI. `src/app/styles.css` contains theme tokens and base defaults; all page layouts and responsive styling use Tailwind utilities. The original TravelBuddy palette, system typography, branding, full-width home hero, card grids, and mobile navigation are retained.
- `src/lib`: typed Supabase RPC client, query options, input validation, and small shared utilities.
- `supabase`: additive SQL migrations, authorization/inventory tests, and the media signing function.
- `prisma/documents/migrations`: historical migrations retained for compatibility. The new runtime does not use Prisma or Next.js.

Use TanStack Query for remote data and React state for local interactions. New routes compose feature components rather than owning business logic. Add backend operations through narrow RPCs; transaction and authorization rules live in Postgres. Database response types are generated; feature types describe the public JSON contracts.

## Features in this milestone

Email registration/login/recovery, configured social login, Traveller/Buddy onboarding, package search/details, live availability, checkout, booking history/cancellation, and private package conversations. Book Now selects today's nearest future slot in Asia/Colombo time, falling forward when needed. Checkout prices and capacity are checked in the database, with the same package locks and idempotency fingerprints used by the old server. Chat retains the booking selection and does not reserve inventory. Inbox queries poll every five seconds while visible.

No payment collection is implemented. Package editing/uploads, public request creation/replies, maps, saved items, reviews, and secondary pages remain deferred. Existing direct/request conversations and package offers are readable. Ownerless catalog entries cannot initiate provider chat.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:test:setup   # creates travelbuddy_refactor_test once; never replaces it
pnpm test:db        # transaction-based tests roll back their fixtures
pnpm test:compat   # migration boundary checks using the original sibling checkout
```

`test:compat` requires the original app's dependencies and private `.env.local`, and imports its server code solely for compatibility testing. Set `LEGACY_CHECKOUT` if it is not at `../travelbuddy`. It tests shared locking, fingerprints/retries, cancellation, thread reuse and message interoperability on the disposable database. It removes only its own fixtures. Do not run integration suites against production.

See [deployment and validation notes](docs/deployment.md) for hosting and the checks performed during this implementation.
See the [development guide](docs/development-guide.md) for the stack, file layout, component placement, and route conventions.
