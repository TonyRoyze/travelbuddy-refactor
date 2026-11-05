-- Checkout hashes its idempotency payload with pgcrypto. Restore the narrow
-- privileges required by its dedicated execution role on existing deployments.
GRANT USAGE ON SCHEMA extensions TO travelbuddy_api_executor;
GRANT EXECUTE ON FUNCTION extensions.digest(text, text) TO travelbuddy_api_executor;

NOTIFY pgrst, 'reload schema';
