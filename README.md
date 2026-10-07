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

The V1.1 customer frontend includes PostgreSQL JSONB account storage, server-verified Google sign-in, traveler onboarding, and revocable server sessions. Set Google and database environment variables and apply the document migrations to activate authentication; see [Google authentication setup](docs/google-authentication.md), [database foundation](docs/backend-database-foundation.md), and the [Kubernetes database migration guide](docs/kubernetes-database-migration.md).

Google is the only sign-in option. Marketplace bookings, reviews, messages, checkout, and provider replies remain browser-based demonstrations. Map tiles come from OpenStreetMap, and experience photography comes from Unsplash. Production booking and payment services are not implemented.

## Project structure

- `src/app` — routes and styles
- `src/components` — discovery, map, account, booking, and shared UI
- `src/lib` — catalog and customer domain logic
- `public` — brand and profile images
- `scripts` — local validation utilities

The app uses Next.js 14, React 18, TypeScript, Leaflet, and Lucide icons.
