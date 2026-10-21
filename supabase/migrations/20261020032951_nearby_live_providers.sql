-- Discovery exposes published meeting points, never a provider's device location.
CREATE TABLE travelbuddy_private.provider_presence (
  provider_id uuid PRIMARY KEY REFERENCES travelbuddy_backend.accounts(id) ON DELETE CASCADE,
  accepting boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE travelbuddy_private.meeting_points (
  package_id varchar(80) PRIMARY KEY REFERENCES travelbuddy_backend.packages(id) ON DELETE CASCADE,
  area varchar(120) NOT NULL CHECK (length(trim(area)) BETWEEN 2 AND 120),
  label varchar(300) NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 300),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX meeting_points_area ON travelbuddy_private.meeting_points (lower(area));
CREATE INDEX online_accepting_providers ON travelbuddy_private.provider_presence(last_seen) WHERE accepting;
ALTER TABLE travelbuddy_private.provider_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE travelbuddy_private.meeting_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON travelbuddy_private.provider_presence,travelbuddy_private.meeting_points FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON travelbuddy_private.provider_presence,travelbuddy_private.meeting_points TO travelbuddy_api_executor;
CREATE POLICY executor_presence ON travelbuddy_private.provider_presence TO travelbuddy_api_executor USING (true) WITH CHECK (true);
CREATE POLICY executor_meeting_points ON travelbuddy_private.meeting_points TO travelbuddy_api_executor USING (true) WITH CHECK (true);

CREATE FUNCTION travelbuddy_private.require_discovery_provider() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb := travelbuddy_private.account();
BEGIN
 IF a->>'onboarding' <> 'completed' OR NOT (a->'roles' ?| ARRAY['provider','guide']) THEN
   RAISE EXCEPTION 'A completed Buddy or Guide account is required.' USING ERRCODE='42501';
 END IF;
 RETURN (a->>'id')::uuid;
END $$;
CREATE FUNCTION travelbuddy_private.presence_data(owner_id uuid) RETURNS jsonb
LANGUAGE sql SET search_path = '' AS $$
 SELECT jsonb_build_object('accepting',coalesce(p.accepting,false),
   'online',coalesce(p.accepting AND p.last_seen > clock_timestamp()-interval '2 minutes',false),
   'expiresAt',CASE WHEN p.accepting THEN p.last_seen+interval '2 minutes' ELSE NULL END)
 FROM (SELECT 1) x LEFT JOIN travelbuddy_private.provider_presence p ON p.provider_id=owner_id;
$$;
CREATE FUNCTION travelbuddy_private.provider_discovery() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_provider_id uuid := travelbuddy_private.require_discovery_provider(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'published',p.published,'meetingPoint',p.data->>'meetingPoint',
  'location',CASE WHEN m.package_id IS NOT NULL THEN jsonb_build_object('area',m.area,'label',m.label,'latitude',m.latitude,'longitude',m.longitude) ELSE NULL END) ORDER BY p.updated_at DESC,p.id),'[]')
 INTO result FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_private.meeting_points m ON m.package_id=p.id WHERE p.owner_id=v_provider_id;
 RETURN jsonb_build_object('presence',travelbuddy_private.presence_data(v_provider_id),'packages',result);
END $$;
CREATE FUNCTION travelbuddy_private.set_provider_accepting(accepting_requests boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_provider_id uuid := travelbuddy_private.require_discovery_provider();
BEGIN
 IF accepting_requests IS NULL THEN RAISE EXCEPTION 'Choose whether to accept requests.'; END IF;
 INSERT INTO travelbuddy_private.provider_presence(provider_id,accepting,last_seen) VALUES(v_provider_id,accepting_requests,clock_timestamp())
 ON CONFLICT(provider_id) DO UPDATE SET accepting=excluded.accepting,last_seen=excluded.last_seen;
 RETURN travelbuddy_private.presence_data(v_provider_id);
END $$;
CREATE FUNCTION travelbuddy_private.provider_heartbeat() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_provider_id uuid := travelbuddy_private.require_discovery_provider();
BEGIN
 UPDATE travelbuddy_private.provider_presence SET last_seen=clock_timestamp() WHERE provider_id=v_provider_id AND accepting;
 RETURN travelbuddy_private.presence_data(v_provider_id);
END $$;
CREATE FUNCTION travelbuddy_private.save_meeting_point(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_provider_id uuid := travelbuddy_private.require_discovery_provider(); pack travelbuddy_backend.packages;
 town text := regexp_replace(trim(input->>'area'),'[[:space:]]+',' ','g'); point_label text := trim(input->>'label');
 lat double precision := (input->>'latitude')::double precision; lng double precision := (input->>'longitude')::double precision;
BEGIN
 IF town IS NULL OR length(town) NOT BETWEEN 2 AND 120 OR point_label IS NULL OR length(point_label) NOT BETWEEN 2 AND 300
  OR lat IS NULL OR NOT (lat BETWEEN -90 AND 90) OR lng IS NULL OR NOT (lng BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Enter a town, meeting point and valid map coordinates.'; END IF;
 SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id=input->>'packageId' FOR UPDATE;
 IF NOT FOUND OR pack.owner_id IS DISTINCT FROM v_provider_id THEN RAISE EXCEPTION 'This experience is not yours to edit.' USING ERRCODE='42501'; END IF;
 INSERT INTO travelbuddy_private.meeting_points(package_id,area,label,latitude,longitude) VALUES(pack.id,town,point_label,lat,lng)
 ON CONFLICT(package_id) DO UPDATE SET area=excluded.area,label=excluded.label,latitude=excluded.latitude,longitude=excluded.longitude,updated_at=clock_timestamp();
 -- Keep the location description on the booking page consistent with its map pin.
 UPDATE travelbuddy_backend.packages SET data=jsonb_set(data,'{meetingPoint}',to_jsonb(point_label)),revision=revision+1,updated_at=clock_timestamp() WHERE id=pack.id;
 RETURN travelbuddy_private.provider_discovery();
END $$;
CREATE FUNCTION travelbuddy_private.nearby_areas() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(area ORDER BY area),'[]') FROM (
 SELECT min(m.area) area FROM travelbuddy_private.meeting_points m
 JOIN travelbuddy_backend.packages p ON p.id=m.package_id
 JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.published AND a.schema_version=1 AND a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide']
 GROUP BY lower(m.area)) towns;
$$;
CREATE FUNCTION travelbuddy_private.nearby_live(area_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF area_name IS NULL OR length(trim(area_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Choose a town or area first.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('experience',travelbuddy_private.package_data(p.data),
 'provider',jsonb_build_object('id',a.id,'name',a.data->>'displayName'),
 'location',jsonb_build_object('area',m.area,'label',m.label,'latitude',m.latitude,'longitude',m.longitude),
 'expiresAt',s.last_seen+interval '2 minutes') ORDER BY p.sort_order,p.id),'[]') INTO result
 FROM travelbuddy_private.meeting_points m JOIN travelbuddy_backend.packages p ON p.id=m.package_id
 JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 JOIN travelbuddy_private.provider_presence s ON s.provider_id=a.id
 WHERE lower(m.area)=lower(regexp_replace(trim(area_name),'[[:space:]]+',' ','g')) AND p.published
 AND a.schema_version=1 AND a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide']
 AND s.accepting AND s.last_seen>clock_timestamp()-interval '2 minutes';
 RETURN jsonb_build_object('items',result,'serverTime',clock_timestamp());
END $$;

-- Exposed API has invoker wrappers only. Private implementations retain the
-- dedicated non-login, non-bypass role used by the existing application API.
CREATE FUNCTION travelbuddy_api.nearby_areas() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.nearby_areas() $$;
CREATE FUNCTION travelbuddy_api.nearby_live(area_name text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.nearby_live(area_name) $$;
CREATE FUNCTION travelbuddy_api.provider_discovery() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.provider_discovery() $$;
CREATE FUNCTION travelbuddy_api.set_provider_accepting(accepting_requests boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.set_provider_accepting(accepting_requests) $$;
CREATE FUNCTION travelbuddy_api.provider_heartbeat() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.provider_heartbeat() $$;
CREATE FUNCTION travelbuddy_api.save_meeting_point(input jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.save_meeting_point(input) $$;
GRANT CREATE ON SCHEMA travelbuddy_private TO travelbuddy_api_executor;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['require_discovery_provider()','presence_data(uuid)','provider_discovery()','set_provider_accepting(boolean)','provider_heartbeat()','save_meeting_point(jsonb)','nearby_areas()','nearby_live(text)'] LOOP
 EXECUTE 'ALTER FUNCTION travelbuddy_private.'||signature||' OWNER TO travelbuddy_api_executor';
 EXECUTE 'REVOKE ALL ON FUNCTION travelbuddy_private.'||signature||' FROM PUBLIC,anon,authenticated';
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA travelbuddy_private FROM travelbuddy_api_executor;
-- Updating the meeting-point text is the only new package-column write needed.
GRANT UPDATE(data,revision,updated_at) ON travelbuddy_backend.packages TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_api.nearby_areas(),travelbuddy_api.nearby_live(text),travelbuddy_api.provider_discovery(),travelbuddy_api.set_provider_accepting(boolean),travelbuddy_api.provider_heartbeat(),travelbuddy_api.save_meeting_point(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_api.nearby_areas(),travelbuddy_api.nearby_live(text),travelbuddy_private.nearby_areas(),travelbuddy_private.nearby_live(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_api.provider_discovery(),travelbuddy_api.set_provider_accepting(boolean),travelbuddy_api.provider_heartbeat(),travelbuddy_api.save_meeting_point(jsonb),travelbuddy_private.provider_discovery(),travelbuddy_private.set_provider_accepting(boolean),travelbuddy_private.provider_heartbeat(),travelbuddy_private.save_meeting_point(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
