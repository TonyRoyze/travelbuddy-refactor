-- Provider controlled live availability, exposed only as a boolean on public experiences.
CREATE OR REPLACE FUNCTION travelbuddy_private.account() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a travelbuddy_backend.accounts; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.' USING ERRCODE='42501'; END IF;
 INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at)
 VALUES(gen_random_uuid(),uid,'{"displayName":"Traveler","roles":["traveler"],"status":"active","onboarding":"pending","avatarMediaId":null,"profileVideoIds":[],"profileDetails":{"bio":"","homeBase":"","languages":"","interests":"","travelStyle":"","specialties":"","yearsExperience":null}}',now())
 ON CONFLICT (supabase_user_id) DO NOTHING;
 SELECT * INTO a FROM travelbuddy_backend.accounts WHERE supabase_user_id=uid;
 IF a.schema_version<>1 OR a.data->>'status'<>'active' THEN RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',a.id,'displayName',a.data->>'displayName','roles',a.data->'roles','onboarding',a.data->>'onboarding','revision',a.revision,'email',auth.jwt()->>'email','liveNow',coalesce((a.data->>'liveNow')::boolean,false));
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.catalog(filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; page_no int:=coalesce((filters->>'page')::int,1); page_size int:=24;
BEGIN
 IF page_no NOT BETWEEN 1 AND 10000 OR length(coalesce(filters->>'q',''))>120 OR coalesce(filters->>'sort','recommended') NOT IN ('recommended','price-low','rating') THEN RAISE EXCEPTION 'Invalid search filters.'; END IF;
 WITH matches AS (
 SELECT p.*,coalesce((a.data->>'liveNow')::boolean,false) AS provider_live_now FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active')
 AND (coalesce(filters->>'q','')='' OR concat_ws(' ',p.title,p.destination,p.country,p.category) ILIKE '%'||(filters->>'q')||'%')
 AND (coalesce(filters->>'category','')='' OR p.category=filters->>'category')
 AND (coalesce(filters->>'destination','')='' OR p.destination ILIKE '%'||(filters->>'destination')||'%')
 AND (filters->>'minPrice' IS NULL OR p.price >= (filters->>'minPrice')::numeric)
 AND (filters->>'maxPrice' IS NULL OR p.price <= (filters->>'maxPrice')::numeric)
 AND (coalesce((filters->>'freeCancellation')::boolean,false)=false OR p.free_cancellation)
 ), paged AS (SELECT * FROM matches ORDER BY CASE WHEN filters->>'sort'='price-low' THEN price END ASC,CASE WHEN filters->>'sort'='rating' THEN rating END DESC,sort_order,id LIMIT page_size OFFSET (page_no-1)*page_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(travelbuddy_private.package_data(data)||jsonb_build_object('liveNow',provider_live_now)) FROM paged),'[]'),'total',(SELECT count(*) FROM matches),'page',page_no,'pageSize',page_size) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.package_detail(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 SELECT travelbuddy_private.package_data(p.data)||jsonb_build_object('canChat',p.owner_id IS NOT NULL,'liveNow',coalesce((a.data->>'liveNow')::boolean,false))
 INTO result FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.id=package_id AND p.published AND (p.owner_id IS NULL OR a.data->>'status'='active');
 IF result IS NULL THEN RAISE EXCEPTION 'Experience not found.' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION travelbuddy_private.set_live_now(live_now boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account();
BEGIN
 IF live_now IS NULL THEN RAISE EXCEPTION 'Choose whether you are live now.'; END IF;
 IF NOT (a->'roles' ? 'provider') OR a->>'onboarding'<>'completed' THEN
  RAISE EXCEPTION 'Only active providers can change live availability.' USING ERRCODE='42501';
 END IF;
 UPDATE travelbuddy_backend.accounts
 SET data=data||jsonb_build_object('liveNow',live_now),updated_at=now()
 WHERE id=(a->>'id')::uuid AND data->>'status'='active' AND data->>'onboarding'='completed';
 IF NOT FOUND THEN RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('liveNow',live_now);
END $$;

ALTER FUNCTION travelbuddy_private.set_live_now(boolean) OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_private.set_live_now(boolean) FROM PUBLIC;

CREATE FUNCTION travelbuddy_api.set_live_now(live_now boolean) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.set_live_now(live_now) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.set_live_now(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.set_live_now(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_private.set_live_now(boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
