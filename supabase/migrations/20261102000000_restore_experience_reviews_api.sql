-- Ensure PostgREST can resolve the public review RPC after deployments where
-- the private implementation was updated but the API wrapper was not applied.
CREATE OR REPLACE FUNCTION travelbuddy_api.experience_reviews(package_id text)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.experience_reviews(package_id)
$$;

REVOKE ALL ON FUNCTION travelbuddy_api.experience_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.experience_reviews(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
