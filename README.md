# TravelBuddy customer app

A responsive travel discovery app with experiences, local guides, travel buddies, maps, booking flows, and customer account pages.

## Run

Requires Node.js 22 or later and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

For a production build:

```bash
pnpm build
pnpm start
```

## What is included

- Experience discovery with list and map views, sorting, and category, date, price, duration, and cancellation filters.
- Guide discovery with area, specialty, language, and tour style filters.
- Buddy discovery with age, gender, interest, and travel pace filters.
- Experience details, saved items, cart, booking and review screens.
- Responsive layouts and optimized image delivery through Next.js. Profile portraits live in `public/profiles`.

## Current integrations

TravelBuddy uses self-hosted Supabase Postgres for account and inbox data, and Supabase Auth for email/password, Google, Facebook, and Apple sign-in. Provider buttons are enabled only when configured on the Supabase server. See [Supabase setup](docs/supabase-setup.md) for local configuration, OAuth credentials, database permissions, and deployment.

First sign-in creates an account with pending onboarding. Registration offers Traveller or Buddy; buddies can reply to traveller requests and send custom packages. Roles and suspension status remain server-managed; social profile metadata cannot grant roles. Marketplace bookings, reviews, and checkout remain browser-based demonstrations. Traveller requests and private replies are stored on the server. Map tiles come from OpenStreetMap, and experience photography comes from Unsplash. Production booking and payment services are not implemented.

## Project structure

- `src/app` — routes and styles
- `src/components` — discovery, map, account, booking, and shared UI
- `src/lib` — catalog and customer domain logic
- `public` — brand and profile images
- `scripts` — local validation utilities

The app uses Next.js 14, React 18, TypeScript, Leaflet, and Lucide icons.

## Traveller requests and private replies

The inbox has a request board and a combined Replies tab for the traveller’s own posts and private conversations. Completed, active accounts with the `traveler` role can post a title, destination, and details. Accounts with the `provider` (buddy) or `guide` role can reply privately. First registration offers Traveller or Buddy. Guide and administrator roles remain assigned through the backend account-management flow.

Each request has a separate conversation for each responder. Only its two participants can read or send messages; the board never returns other responders’ conversations. Closing a request stops new replies and leaves existing conversations available. The inbox refreshes every five seconds while open and shows the latest 50 posts/conversations and 100 messages per conversation.

Requests and messages use the existing Prisma/PostgreSQL backend and Supabase sessions. Apply migrations with `pnpm db:documents:deploy`. Existing direct conversations are preserved. The old browser demo chats are no longer shown. Experience and booking pages now open a prefilled request form.

Run privacy, role, validation, and persistence integration checks against a migrated disposable database with `DOCUMENT_TEST_DATABASE_URL=... pnpm test:inbox:integration`. Never point this at the production database.

Requests can include a named pickup/current location and a map pin. Buddies and guides can search within 5–100 km of a chosen point or their current location; matching requests are ordered by distance. Requests without a pin stay on the main board. Location is shared only when the user adds it.

Buddies and guides can send custom packages in request conversations, with a title, inclusions, a total price in LKR or USD, and vehicle availability/details. Packages are private messages and are not payments or confirmed bookings. Travellers cannot create package offers.

### Local test accounts

On the isolated feature database, set `TEST_ACCOUNTS_ENABLED=true` and `TEST_ACCOUNT_DATABASE_HOST` to that database’s hostname in `.env.local`, then run `pnpm dev`. Open `/test-accounts` to switch between Ravi (buddy) and Maya (traveller). An Ella railway station request is seeded on first use. These accounts keep their posts/messages so you can test both sides. The page and sign-in endpoint return 404 outside development; the endpoint additionally requires a localhost request and a matching configured database host. Test accounts sign in through Supabase Auth and are also restricted to a localhost Supabase instance.
