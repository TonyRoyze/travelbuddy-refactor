-- Filter by country before ordering and pagination, preserving catalog authorization.
CREATE OR REPLACE FUNCTION travelbuddy_private.catalog(filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; page_no int:=coalesce((filters->>'page')::int,1); page_size int:=24;
BEGIN
 IF page_no NOT BETWEEN 1 AND 10000 OR length(coalesce(filters->>'q',''))>120 OR coalesce(filters->>'sort','recommended') NOT IN ('recommended','price-low','rating') THEN RAISE EXCEPTION 'Invalid search filters.'; END IF;
 WITH matches AS (
 SELECT p.* FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active')
 AND (coalesce(filters->>'q','')='' OR concat_ws(' ',p.title,p.destination,p.country,p.category) ILIKE '%'||(filters->>'q')||'%')
 AND (coalesce(filters->>'country','')='' OR lower(trim(p.country))=lower(trim(filters->>'country')))
 AND (coalesce(filters->>'category','')='' OR p.category=filters->>'category')
 AND (coalesce(filters->>'destination','')='' OR p.destination ILIKE '%'||(filters->>'destination')||'%')
 AND (filters->>'minPrice' IS NULL OR p.price >= (filters->>'minPrice')::numeric)
 AND (filters->>'maxPrice' IS NULL OR p.price <= (filters->>'maxPrice')::numeric)
 AND (coalesce((filters->>'freeCancellation')::boolean,false)=false OR p.free_cancellation)
 ), paged AS (SELECT * FROM matches ORDER BY CASE WHEN filters->>'sort'='price-low' THEN price END ASC,CASE WHEN filters->>'sort'='rating' THEN rating END DESC,sort_order,id LIMIT page_size OFFSET (page_no-1)*page_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(travelbuddy_private.package_data(data)) FROM paged),'[]'),'total',(SELECT count(*) FROM matches),'page',page_no,'pageSize',page_size) INTO result;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
