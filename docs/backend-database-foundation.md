# Database foundation

TravelBuddy uses Prisma with a private `travelbuddy_backend` schema in self-hosted Supabase Postgres. Accounts bind to verified Supabase user IDs; Supabase manages identities and sessions.

See [Supabase setup](supabase-setup.md) for configuration and access control. Existing historical migrations are retained; the Supabase migration removes the old custom identity/session tables.

The package catalog combines indexed browse fields with a JSONB package payload; see [package catalog search](package-catalog-search.md).
