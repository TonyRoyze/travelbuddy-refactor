# Database foundation

UTrippers uses Prisma with a private `travelbuddy_backend` schema in self-hosted Supabase Postgres. Accounts bind to verified Supabase user IDs; Supabase manages identities and sessions.

See [Supabase setup](supabase-setup.md) for configuration and access control. Existing historical migrations are retained; the Supabase migration removes the old custom identity/session tables.

The package catalog combines indexed browse fields with a JSONB package payload; see [package catalog search](package-catalog-search.md).

### Customer-care tickets

Apply the document database migrations before enabling tickets. Set `SUPPORT_AGENT_ACCOUNT_IDS` to a comma-separated list of trusted customer-care account UUIDs on the server, and restart the application. These accounts can view and reply to all support tickets from Inbox → Customer care; other accounts can access only their own tickets. An empty setting disables new submissions. Care agents must check the inbox for updates; this implementation does not send notifications. Ticket lists show the 200 most recently updated tickets.
