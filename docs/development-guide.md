# Development guide

This repository contains two independently runnable TravelBuddy frontends:

- The current app at the repository root uses React, Vite, TypeScript, Tailwind CSS v4, shadcn/ui with Base UI, TanStack Router, TanStack Query, Zod, and Supabase JS.
- The earlier Next.js app is preserved in [`legacy/`](../legacy/). It uses the same existing Supabase database and retains the previous server implementation and Prisma migration history.

The root app is the active implementation for new work. The legacy directory exists so both versions remain available in the same branch during the transition.

## Stack and commands

Use Node 22.12 or newer and pnpm 11. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev            # Vite :5173 and profile upload service :5174
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:types       # regenerate Supabase API types
```

The root frontend reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. Only browser-safe values belong there. Database administration credentials stay on the Supabase host or in a private operator environment.

Profile uploads also require FFmpeg/ffprobe and the server-only `.env.media.local`; see [profile service setup](profile-parity.md).

To run the previous app, install and start it from `legacy/`:

```sh
cd legacy
pnpm install --frozen-lockfile
pnpm dev            # Next.js at http://localhost:3000
```

Give the legacy app its own local environment file based on `legacy/.env.example`; do not copy service-role or database credentials into the Vite app. The two frontends have separate browser sessions, but their users and application records map to the same Supabase instance.

## Where code belongs

```text
src/
  app/                 app-wide providers, router setup, shell, theme and base styles
  routes/               file routes, URL validation, guards, and page composition
  features/<area>/      domain UI, hooks, queries, schemas, and feature-specific types
  components/ui/         shadcn components built on Base UI
  lib/                   Supabase client, shared query helpers and small utilities
  types/                 generated database API types
supabase/
  migrations/            additive database changes
  tests/                 database authorization and behavior checks
  functions/              narrowly scoped Edge Functions
services/profile-media/  server-side profile upload validation and storage
legacy/                  previous Next.js app, preserved during transition
```

Put a reusable primitive in `src/components/ui/` only when it is a general UI building block. Add or update these through the shadcn CLI, selecting the Base UI library. Compose primitives into product-specific components inside their feature directory. For example, package cards and availability pickers belong in `src/features/catalog/` or `src/features/bookings/`, not in the shared UI directory.

Use Tailwind utility classes for component layout, responsive behavior, spacing, and colors. `src/app/styles.css` is for Tailwind imports, theme tokens, and global element defaults; avoid adding page-specific selectors there. Prefer shadcn components for buttons, fields, dialogs, cards, menus, and feedback surfaces, and keep their accessibility behavior intact when composing them.

Keep server state in TanStack Query, local interaction state in React, and validate user input with Zod. Put account, booking, inventory, and conversation rules in the database API rather than duplicating authority in browser components. Add database types by running `pnpm db:types`; do not hand-edit generated `src/types/database.ts`.

## Adding a route

TanStack Router's Vite plugin uses `src/routes/` as the file-route directory and generates `src/routeTree.gen.ts`. Create a route file using the route path as its name. Examples:

| URL               | File                                        | Notes                            |
| ----------------- | ------------------------------------------- | -------------------------------- |
| `/search`         | `src/routes/search.tsx`                     | Public route                     |
| `/experience/$id` | `src/routes/experience.$id.tsx`             | `$id` is a path parameter        |
| `/bookings`       | `src/routes/_authenticated.bookings.tsx`    | Child of the protected layout    |
| `/booking/$id`    | `src/routes/_authenticated.booking.$id.tsx` | Protected route with a parameter |

The `_authenticated` prefix is a pathless layout. Its route guard checks the current user and active account before protected child routes render. Keep route files small: define the route, validate its URL state, apply route-level loading/error behavior when needed, and render feature components. Put data fetching and domain behavior in the feature folder.

For URL search parameters, define a Zod schema and pass it to `validateSearch`; parse and normalize values there rather than trusting string query parameters in components. Use route context or loaders only for navigation-level requirements. Use TanStack Query for API data and its cache.

After adding or renaming a route, run the Vite dev server or `pnpm typecheck` so the router plugin regenerates route types. Do not edit `src/routeTree.gen.ts` by hand. Use `createFileRoute` for a route and `createFileRoute('/_authenticated')` only for the authenticated layout following the neighboring route files' generated route IDs.

## Supabase changes

Expose only `travelbuddy_api` through PostgREST. Add client-callable operations as narrow RPCs with authorization derived from `auth.uid()`. Keep private tables and implementation functions in their existing private schemas, with explicit grants, fixed search paths, and database-side ownership and role checks. Use additive migrations in `supabase/migrations/`; do not reset or replace the shared database. See [`deployment.md`](deployment.md) for migration and hosting procedures.

## Before handing off

For application changes, run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. For database changes, use the disposable database setup and compatibility checks documented in the root README. Never point destructive or fixture-based database checks at production or the shared local database.
