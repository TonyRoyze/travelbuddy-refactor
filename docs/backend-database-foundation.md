# JSONB backend foundation

The `backend/database-foundation` feature is integrated into the repository root alongside the V1.1 customer frontend. The document roadmap covers the cumulative Phase 3 platform.

## Scope

Accounts and Google authentication identities are JSONB documents with UUID IDs, versioned envelopes, revision counters, and timestamps. There are no foreign keys or Prisma relations. The backend creates an account and its Google identity in one transaction. Google identity uniqueness is enforced by an expression index over `provider` and `providerSubject`, not by email. Different identities can share an email; account linking is a separate authenticated workflow.

New accounts default to traveler, active, onboarding pending. Role assignment and account status changes are trusted server operations. These modules expose no public API and do not implement token verification, sign-in, sessions, passwords, or automatic account linking. The future Google login feature must verify Google claims before calling account operations and must enforce account status before granting a session. Google identities contain no access tokens, refresh tokens, or passwords.

Each update uses the expected revision, increments it atomically, and rejects stale writes. Zod validates document writes and reads; SQL checks reject invalid required fields even when bypassing the application. Schema version 1 is the only supported format; future document changes need coordinated application and SQL migrations. JSON references need service-level validation. No hard-delete service is provided; use account status until retention/deletion policies are designed.

## Setup

Use PostgreSQL 16 or later. The app connects through the single `DOCUMENT_DATABASE_URL` setting in `.env.local` or the process environment. It must use `schema=travelbuddy_backend`, which keeps this backend separate from the legacy relational demo. The URL can point to local PostgreSQL, Neon, or a PostgreSQL service in Kubernetes; switching providers does not require an application code change. Keep credentials out of source control.

For a Neon-to-Kubernetes move, see [Moving the database to Kubernetes](kubernetes-database-migration.md). The current local `.env.local` is configured for the Neon production branch; use an isolated database or Neon branch for development writes.

From the repository root:

```powershell
npm run db:documents:generate
npm run db:documents:validate
npm run db:documents:deploy
npm run test:documents
```

Deploy applies only the versioned migrations under `prisma/documents/migrations`; it does not seed demo accounts or reset tables. Client generation runs during dependency installation and requires no live database. The client is generated into ignored `src/generated/documents`. Do not use `db push` for the document backend: the migration contains JSON checks and expression indexes that Prisma cannot represent in its schema. Backend clients are constructed lazily so frontend builds do not require database credentials.

The old relational prototype schema and seed commands are excluded from this frontend integration. Use only the document migrations.

## Integration verification

Use a separate disposable PostgreSQL database. Deploy this migration to it first by temporarily setting `DOCUMENT_DATABASE_URL` to its URL and running `db:documents:deploy`. Then restore the application URL and set `DOCUMENT_TEST_DATABASE_URL` to the test URL, with `schema=travelbuddy_backend`. Run `npm run test:documents:integration`. The test checks simultaneous signup uniqueness, optimistic concurrency, and SQL rejection of malformed documents, and removes its own records afterward. A live database is necessary to verify these guarantees.

## Phase 3 document roadmap

| Feature | Future document boundaries |
| --- | --- |
| Discovery and provider tools | businesses, guide_profiles, catalog_locations, listings |
| Live providers and schedules | availability_slots |
| Saved experiences and checkout | saved_collections, carts, bookings, service_orders, payments |
| Trip planning and connected journeys | trips with embedded days/activities; bookings with immutable item snapshots |
| Community and package introductions | traveler_profiles, travel_requests, proposals |
| Messaging | conversations and separate messages |
| Scheduled/on-demand guides and active sessions | guide_sessions; questions/answers as conversation messages |
| Reviews | reviews linked to completed service orders |
| Collaboration and payouts | partnerships, settlements |
| Transport suggestions and handoffs | embedded trip segments; independently fulfilled service_orders |
| Offline QR and portable history | share_exports, import_previews; untrusted imports never create verified bookings |
| Administration | notifications, admin_records, audit_events |

These are design boundaries, not tables provisioned in this feature. Sessions and optional password credentials will be designed with the Google login feature once the authentication method is agreed.

```mermaid
flowchart LR
  A[accounts: JSONB] -->|ID inside JSON| I[auth_identities: JSONB]
  A -. future .-> T[trips]
  A -. future .-> B[bookings]
  B -. future .-> S[service_orders]
  B -. future .-> P[payments]
```

Identity JSON references an account ID; the diagram represents logical associations, not foreign keys.

## Verification in this workspace

The two document migrations have been applied to the linked Neon production branch, and a subsequent `db:documents:deploy` reported no pending migrations. The database integration test has not been run against a separate disposable database; concurrency and SQL constraint behavior should be checked there before relying on those guarantees.
