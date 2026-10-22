# Live provider discovery

Visit `/nearby` or choose **Explore nearby** on the homepage. Select a town or area first, then switch between Map and List. Both views show the same experiences. Selecting a pin highlights its experience; experiences sharing coordinates use a shared pin and remain individually listed. Pins represent the experience's public meeting/pickup point, never the provider's device location.

A live host is a completed, active Buddy or Guide who has enabled **Accepting requests** and whose app renewed its heartbeat within the last two minutes. This is independent of booking availability: a host may accept questions even if today's bookable slots are full. Package chat and booking remain separate actions.

## Provider setup

In Account, Buddy/Guide accounts can:

1. Enable or disable **Accepting requests**.
2. Select one of their owned experiences.
3. Enter its town/area and meeting/pickup description, then click its location on the map or enter coordinates.
4. Save the meeting point. Only published experiences appear publicly.

The feature does not assign ownerless catalog listings to users or create provider experiences. The initial local catalog has no assigned owners, so real discovery starts empty until provider-owned experiences have saved points and the provider goes online. No sample provider is presented as a real online host.

The app sends a heartbeat every 30 seconds while open, including in background tabs when the browser permits it. Closing or suspending the app, losing the connection, or signing out stops renewal; the host expires within two minutes. Turning the switch off cannot be undone by a heartbeat from another tab. It takes effect on travelers' next refresh (at most 15 seconds while connected). The acceptance preference persists across app restarts; opening the app renews it only if it remains enabled.

Live results refresh every 15 seconds and on window focus. A client-side expiry check uses the API's server time to remove stale hosts even between refreshes or when the visitor's device clock is incorrect. Failed refreshes display an error and hide the stale results. Tile failures preserve the list, meeting-point details and a map retry action.

## Database

The additive `nearby_live_providers` migration adds two private RLS-enabled tables for presence and meeting points. Anonymous/authenticated roles cannot read them directly. Public API wrappers expose the town list and online published experiences. Authenticated provider RPCs derive ownership from the verified user, not a caller-supplied owner ID. Coordinate ranges and provider eligibility are checked in Postgres. Meeting-point updates use the existing package row lock and synchronize the booking page's meeting-point description.

Run `pnpm db:migrate` on the target Supabase instance, then `pnpm db:types`. Keep the private schemas out of PostgREST exposure. The existing `travelbuddy_api` schema is the only public entry point. Map tiles use OpenStreetMap with attribution.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- `pnpm test:db` runs the existing API suite and the new nearby suite in the disposable `travelbuddy_refactor_test` database. Apply new migrations there first; `db:test:setup` preserves an existing test database.
- `pnpm test:compat` verifies the legacy/new booking and messaging boundary.
- `pnpm exec tsx scripts/test-nearby-http.ts` creates uniquely named temporary users and experiences only on localhost, exercises real Auth and RPCs, and removes its own fixtures. It reads server-only test credentials from the original sibling checkout (or `LEGACY_CHECKOUT`); no server key enters the browser app.
- For browser QA, run that script with `--keep-fixtures`. Pass its generated fixture file to `scripts/test-nearby-browser.py` using Python Playwright with Chromium installed. The script checks point editing, shared pins, view switching, town filtering, mobile layout, manual status changes, chat and expiry. Finally run `pnpm exec tsx scripts/test-nearby-http.ts --cleanup /path/to/fixture.json`.

## Sri Lankan towns and local examples

The town picker includes 33 Sri Lankan starter towns even before any meeting points are published. Published custom areas are merged into the same alphabetic list without case-insensitive duplicates. An empty town keeps the normal offline/empty state; starter towns never manufacture online providers.

Run `pnpm seed:nearby` against the local Docker stack to add six clearly labelled `[Demo]` experiences in Ella, Colombo, Galle and Kandy and four example conversations (16 messages). The default Buddy is the existing local `vidura gunawardana` account; pass another completed Buddy account UUID with `pnpm seed:nearby <account-id>`. The first two existing, active, completed Travellers participate in the example conversations (currently Alex and Maya). The seed uses real package ownership, meeting points and conversation RPCs. It creates no Auth accounts, sends no emails, changes no passwords and creates no reservations. It is restricted to the `supabase-db` local Docker container, and repeating it does not duplicate packages or conversations.

Sign in as the Buddy and open Account to enable **Accepting requests**; keep the app open. Then open `/nearby?area=Ella` in a Traveller/anonymous browser to see the two Ella examples. Colombo has two examples; Galle and Kandy have one each. The demo Buddy expires from live results normally when their app closes. The examples remain available in catalog/public Buddy pages while offline, and the seeded conversations appear in the participants’ Inbox.

The home page now requests `country: "Sri Lanka"` from the catalog API, with country filtering applied before pagination, and shows Sri Lankan destination cards. Existing overseas catalog records remain available through general search. `pnpm exec tsx scripts/link-sri-lanka-packages.ts [buddy-account-id]` links ownerless local Sri Lankan catalog packages to Raj’s Buddy account by default, updating their displayed supplier name. Existing ownership is preserved. Colombo Street Food, Sigiriya Sunrise and Yala Safari are now linked locally to Raj. The six labelled demo experiences and their conversations retain their original Buddy ownership.
