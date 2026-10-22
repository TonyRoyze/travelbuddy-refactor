BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE result jsonb; item jsonb; BEGIN
 result:=travelbuddy_api.catalog('{"country":"Sri Lanka"}');
 ASSERT (result->>'total')::int>0,'Sri Lankan catalog has entries';
 FOR item IN SELECT value FROM jsonb_array_elements(result->'items') LOOP
  ASSERT item->>'country'='Sri Lanka','Country filter excludes overseas packages';
 END LOOP;
 ASSERT (travelbuddy_api.catalog('{"country":"Sri Lanka","q":"Japan"}')->>'total')::int=0,'Country and search filters combine';
 ASSERT (travelbuddy_api.catalog('{}')->>'total')::int>(result->>'total')::int,'Unfiltered catalog remains available';
END $$;
ROLLBACK;
