-- Restore legacy discovery filters against actual inventory and provider presence.
CREATE FUNCTION travelbuddy_private.catalog_has_places(package_id text,selected_day date DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE pack travelbuddy_backend.packages; first_day date:=coalesce(selected_day,(now() AT TIME ZONE 'Asia/Colombo')::date); last_day date:=coalesce(selected_day,(now() AT TIME ZONE 'Asia/Colombo')::date+180);
BEGIN
 SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id=package_id;
 RETURN EXISTS(
 SELECT 1 FROM generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d
 CROSS JOIN LATERAL jsonb_array_elements(pack.data->'options') WITH ORDINALITY o(value,n)
 CROSS JOIN LATERAL travelbuddy_private.slots(pack,d::date,(o.n-1)::int) s
 WHERE s.capacity>coalesce((SELECT sum(b.travelers) FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.date=d::date AND b.option_index=(o.n-1)::int AND b.time=s.slot_time AND b.status='confirmed'),0)
 );
END $$;
ALTER FUNCTION travelbuddy_private.catalog_has_places(text,date) OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_private.catalog_has_places(text,date) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION travelbuddy_private.catalog(filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; page_no int:=coalesce((filters->>'page')::int,1); page_size int:=24; selected_day date:=nullif(filters->>'date','')::date; live_only boolean:=coalesce((filters->>'live')::boolean,false);
BEGIN
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR page_no NOT BETWEEN 1 AND 10000 OR length(coalesce(filters->>'q',''))>120 OR length(coalesce(filters->>'destination',''))>120 OR length(coalesce(filters->>'country',''))>120 OR length(coalesce(filters->>'category',''))>80 OR coalesce(filters->>'sort','recommended') NOT IN('recommended','price-low','rating') OR coalesce(filters->>'duration','') NOT IN('','short','long')
 OR (filters->>'minPrice')::numeric<0 OR (filters->>'maxPrice')::numeric<0 OR (filters->>'minPrice')::numeric>(filters->>'maxPrice')::numeric THEN RAISE EXCEPTION 'Check your search filters.'; END IF;
 IF selected_day IS NOT NULL AND (selected_day::text<>filters->>'date' OR selected_day<(now() AT TIME ZONE 'Asia/Colombo')::date OR selected_day>(now() AT TIME ZONE 'Asia/Colombo')::date+180) THEN RAISE EXCEPTION 'Choose a date within the next 180 days.'; END IF;
 WITH candidates AS MATERIALIZED (
 SELECT p.* FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
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
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(travelbuddy_private.package_data(data) ORDER BY CASE WHEN filters->>'sort'='price-low' THEN price END ASC,CASE WHEN filters->>'sort'='rating' THEN rating END DESC,sort_order,id) FROM paged),'[]'),'total',(SELECT count(*) FROM matches),'page',page_no,'pageSize',page_size) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.search_suggestions(query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF query IS NULL OR length(trim(query))<2 THEN RETURN '[]'; END IF;
 IF length(query)>120 THEN RAISE EXCEPTION 'Search text is too long.'; END IF;
 WITH visible AS (SELECT p.* FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active')),
 suggestions AS (SELECT DISTINCT v.value,v.kind FROM visible p CROSS JOIN LATERAL (VALUES(p.destination,'destination'),(p.country,'country'),(p.category,'category'),(p.title,'package')) v(value,kind) WHERE v.value ILIKE '%'||trim(query)||'%'),
 ranked AS (SELECT * FROM suggestions ORDER BY (lower(value) LIKE lower(trim(query))||'%') DESC,value,kind LIMIT 8)
 SELECT coalesce(jsonb_agg(jsonb_build_object('value',value,'kind',kind) ORDER BY (lower(value) LIKE lower(trim(query))||'%') DESC,value,kind),'[]') INTO result FROM ranked;
 RETURN result;
END $$;
ALTER FUNCTION travelbuddy_private.search_suggestions(text) OWNER TO travelbuddy_api_executor;
CREATE FUNCTION travelbuddy_api.search_suggestions(query text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.search_suggestions(query)$$;
REVOKE ALL ON FUNCTION travelbuddy_private.search_suggestions(text),travelbuddy_api.search_suggestions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_private.search_suggestions(text),travelbuddy_api.search_suggestions(text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
