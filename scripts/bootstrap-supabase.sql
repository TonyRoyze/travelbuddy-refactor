-- Run once on a new Supabase database as supabase_admin, before Prisma migrations.
-- Supply app_password and migration_password as psql variables. Do not commit passwords.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE travelbuddy_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE travelbuddy_migrator LOGIN PASSWORD :'migration_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO travelbuddy_app, travelbuddy_migrator;
CREATE SCHEMA travelbuddy_backend AUTHORIZATION travelbuddy_migrator;
GRANT USAGE ON SCHEMA travelbuddy_backend TO travelbuddy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE travelbuddy_migrator IN SCHEMA travelbuddy_backend
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO travelbuddy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE travelbuddy_migrator IN SCHEMA travelbuddy_backend
  GRANT USAGE, SELECT ON SEQUENCES TO travelbuddy_app;
ALTER ROLE travelbuddy_app SET search_path TO travelbuddy_backend;
ALTER ROLE travelbuddy_migrator SET search_path TO travelbuddy_backend;
COMMIT;
