-- Include only published catalog items' saved meeting points, never device locations.
-- Preserve the existing catalog filters, ordering, live presence and pagination.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('travelbuddy_private.catalog(jsonb)'::regprocedure) INTO definition;
  IF position('jsonb_build_object(''liveNow'',provider_live_now)' IN definition) = 0 THEN
    RAISE EXCEPTION 'Catalog map update could not locate the catalog result projection';
  END IF;
  definition := replace(definition,
    'jsonb_build_object(''liveNow'',provider_live_now)',
    'jsonb_build_object(''liveNow'',provider_live_now,''location'',(SELECT jsonb_build_object(''latitude'',m.latitude,''longitude'',m.longitude,''label'',m.label,''area'',m.area) FROM travelbuddy_private.meeting_points m WHERE m.package_id=data->>''id''))');
  EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
