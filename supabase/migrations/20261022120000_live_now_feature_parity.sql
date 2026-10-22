-- Preserve phase-parity profile/discovery fields while exposing Live Now.
CREATE OR REPLACE FUNCTION travelbuddy_private.account() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a travelbuddy_backend.accounts; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.' USING ERRCODE='42501'; END IF;
 INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at)
 VALUES(gen_random_uuid(),uid,'{"displayName":"Traveler","roles":["traveler"],"status":"active","onboarding":"pending","avatarMediaId":null,"profileVideoIds":[],"profileDetails":{"bio":"","homeBase":"","languages":"","interests":"","travelStyle":"","specialties":"","yearsExperience":null}}',now())
 ON CONFLICT(supabase_user_id) DO NOTHING;
 SELECT * INTO a FROM travelbuddy_backend.accounts WHERE supabase_user_id=uid;
 IF a.schema_version<>1 OR a.data->>'status'<>'active' THEN RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',a.id,'displayName',a.data->>'displayName','roles',a.data->'roles','onboarding',a.data->>'onboarding','revision',a.revision,'email',auth.jwt()->>'email',
 'profileDetails',travelbuddy_private.profile_fields(a.data->'profileDetails'),'avatarMediaId',a.data->'avatarMediaId','profileVideoIds',coalesce(a.data->'profileVideoIds','[]'),
 'liveNow',coalesce((a.data->>'liveNow')::boolean,false));
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.package_detail(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 SELECT travelbuddy_private.package_data(p.data)||jsonb_build_object(
   'providerId',p.owner_id,
   'canChat',coalesce(a.schema_version=1 AND a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide'] AND a.supabase_user_id IS DISTINCT FROM auth.uid(),false),
   'liveNow',coalesce((a.data->>'liveNow')::boolean,false))
 INTO result FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.id=package_id AND p.published AND(p.owner_id IS NULL OR a.data->>'status'='active');
 IF result IS NULL THEN RAISE EXCEPTION 'Experience not found.' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.catalog(filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; page_no int:=coalesce((filters->>'page')::int,1); page_size int:=24; selected_day date:=nullif(filters->>'date','')::date; live_only boolean:=coalesce((filters->>'live')::boolean,false);
BEGIN
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR page_no NOT BETWEEN 1 AND 10000 OR length(coalesce(filters->>'q',''))>120 OR length(coalesce(filters->>'destination',''))>120 OR length(coalesce(filters->>'country',''))>120 OR length(coalesce(filters->>'category',''))>80 OR coalesce(filters->>'sort','recommended') NOT IN('recommended','price-low','rating') OR coalesce(filters->>'duration','') NOT IN('','short','long')
 OR (filters->>'minPrice')::numeric<0 OR (filters->>'maxPrice')::numeric<0 OR (filters->>'minPrice')::numeric>(filters->>'maxPrice')::numeric THEN RAISE EXCEPTION 'Check your search filters.'; END IF;
 IF selected_day IS NOT NULL AND (selected_day::text<>filters->>'date' OR selected_day<(now() AT TIME ZONE 'Asia/Colombo')::date OR selected_day>(now() AT TIME ZONE 'Asia/Colombo')::date+180) THEN RAISE EXCEPTION 'Choose a date within the next 180 days.'; END IF;
 WITH candidates AS MATERIALIZED (
 SELECT p.*,coalesce((a.data->>'liveNow')::boolean,false) AS provider_live_now FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active')
 AND (coalesce(filters->>'q','')='' OR concat_ws(' ',p.title,p.destination,p.country,p.category) ILIKE '%'||(filters->>'q')||'%')
 AND (coalesce(filters->>'country','')='' OR lower(trim(p.country))=lower(trim(filters->>'country')))
 AND (coalesce(filters->>'category','')='' OR p.category=filters->>'category')
 AND (coalesce(filters->>'destination','')='' OR p.destination ILIKE '%'||(filters->>'destination')||'%')
 AND (filters->>'minPrice' IS NULL OR p.price>=(filters->>'minPrice')::numeric)
 AND (filters->>'maxPrice' IS NULL OR p.price<=(filters->>'maxPrice')::numeric)
 AND (NOT coalesce((filters->>'freeCancellation')::boolean,false) OR p.free_cancellation)
 AND (coalesce(filters->>'duration','')='' OR (filters->>'duration'='short' AND p.duration_minutes<=240) OR (filters->>'duration'='long' AND p.duration_minutes>240))
 AND (NOT live_only OR (a.schema_version=1 AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide'] AND EXISTS(SELECT 1 FROM travelbuddy_private.provider_presence presence WHERE presence.provider_id=p.owner_id AND presence.accepting AND presence.last_seen>clock_timestamp()-interval '2 minutes')))
 ), matches AS MATERIALIZED (
 SELECT * FROM candidates p WHERE (selected_day IS NULL AND NOT live_only) OR travelbuddy_private.catalog_has_places(p.id,selected_day)
 ), paged AS (
 SELECT * FROM matches ORDER BY CASE WHEN filters->>'sort'='price-low' THEN price END ASC,CASE WHEN filters->>'sort'='rating' THEN rating END DESC,sort_order,id LIMIT page_size OFFSET(page_no-1)*page_size
 )
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(travelbuddy_private.package_data(data)||jsonb_build_object('liveNow',provider_live_now) ORDER BY CASE WHEN filters->>'sort'='price-low' THEN price END ASC,CASE WHEN filters->>'sort'='rating' THEN rating END DESC,sort_order,id) FROM paged),'[]'),'total',(SELECT count(*) FROM matches),'page',page_no,'pageSize',page_size) INTO result;
 RETURN result;
END $$;

NOTIFY pgrst,'reload schema';
