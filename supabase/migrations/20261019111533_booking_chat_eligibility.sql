-- Keep the public chat affordance aligned with start_chat's host checks.
-- Replacing this existing private implementation preserves its restricted owner.
CREATE OR REPLACE FUNCTION travelbuddy_private.package_detail(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 SELECT travelbuddy_private.package_data(p.data) || jsonb_build_object('canChat',
   coalesce(a.schema_version = 1
     AND a.data->>'status' = 'active'
     AND a.data->>'onboarding' = 'completed'
     AND a.data->'roles' ?| ARRAY['provider', 'guide']
     AND a.supabase_user_id IS DISTINCT FROM auth.uid(), false))
 INTO result
 FROM travelbuddy_backend.packages p
 LEFT JOIN travelbuddy_backend.accounts a ON a.id = p.owner_id
 WHERE p.id = package_id AND p.published
   AND (p.owner_id IS NULL OR a.data->>'status' = 'active');
 IF result IS NULL THEN RAISE EXCEPTION 'Experience not found.' USING ERRCODE = 'P0002'; END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION travelbuddy_private.package_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_private.package_detail(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
