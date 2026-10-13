# Package catalog browse and search

Package browsing uses the same PostgreSQL/Prisma document backend as authentication and the inbox. Package records live in the `travelbuddy_backend.packages` table. Searchable columns (title, destination, country, category, price, rating, duration, and cancellation policy) are indexed separately; the complete card/detail payload is stored as JSONB so the existing experience UI can consume it without a second mapping layer.

## Apply and seed

Configure `DOCUMENT_DATABASE_URL` for a development database or isolated Neon branch. Keep `schema=travelbuddy_backend` in the URL. Then run:

```powershell
pnpm db:documents:deploy
pnpm db:packages:seed
```

The first command applies the versioned SQL migration. The second upserts the current sample experiences from `src/lib/catalog.ts` into the package table and is safe to rerun. It does not write to a database until explicitly run. Do not point development seeding at production.

## Browse API

`GET /api/packages` is public and returns published packages only. Supported query parameters:

| Parameter | Meaning |
| --- | --- |
| `q` | Case-insensitive text match across title, destination, country, and category |
| `destination` | Destination text match |
| `category` | Category match |
| `minPrice`, `maxPrice` | Inclusive USD price bounds |
| `duration` | `short` (up to 4 hours) or `long` (over 4 hours) |
| `freeCancellation` | Set to `true` to require free cancellation |
| `sort` | `recommended`, `price-low`, or `rating` |
| `page`, `pageSize` | Page starts at 1; page size is capped at 50 |

Responses include `packages`, `total`, `page`, and `pageSize`. Invalid filters return 400; database/configuration failures return a generic 503 response. Search results are never cached.

`GET /api/packages/suggestions?q=co` returns up to eight matching destinations, countries, categories, and package titles, with prefix matches prioritized. The search field debounces requests, supports keyboard navigation, and lets the visitor select a suggestion. If the backend is unavailable or has no matching rows, it suggests from the bundled sample catalog.

The `/search` and `/nearby` discovery screen now sends text, category, price, duration, cancellation, and sort filters to this API. Date availability and live-availability filtering still use the existing browser demo booking data. When no backend database is configured, the screen keeps the sample catalog available and displays a note; it does not pretend the backend search succeeded.

This feature covers public browsing and search. Supplier package creation, editing, moderation, availability, and booking persistence are separate backend features and are not added here.
