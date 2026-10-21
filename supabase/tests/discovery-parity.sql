BEGIN;
DO $$BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('a5151515-5151-4151-8151-515151515151','a5151515-5151-4151-8151-515151515152','{"displayName":"Search Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('a6161616-6161-4161-8161-616161616161','a6161616-6161-4161-8161-616161616162','{"displayName":"Search Traveller","roles":["traveler"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
SELECT 'audit-search-'||n,'a5151515-5151-4151-8151-515151515151','Audit Tea Walk '||n,'Audit Ella','Sri Lanka','Tours & sightseeing',20,0,CASE WHEN n=2 THEN 300 ELSE 120 END,'2 hours',true,n<>3,
 data||jsonb_build_object('id','audit-search-'||n,'title','Audit Tea Walk '||n,'destination','Audit Ella','country','Sri Lanka','category','Tours & sightseeing','options',jsonb_build_array(jsonb_build_object('name','Full option','price',20,'duration','2 hours','detail','test','times',jsonb_build_array('09:00'),'capacity',3),jsonb_build_object('name','Available option','price',20,'duration','2 hours','detail','test','times',jsonb_build_array('11:00'),'capacity',3))),
 jsonb_build_object('startDate',(now() AT TIME ZONE 'Asia/Colombo')::date+1,'endDate',(now() AT TIME ZONE 'Asia/Colombo')::date+180,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'exceptions','[]'::jsonb),now() FROM travelbuddy_backend.packages p CROSS JOIN generate_series(1,3) n WHERE p.id=(SELECT id FROM travelbuddy_backend.packages ORDER BY id LIMIT 1);
INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,sort_order,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
SELECT 'audit-page-'||n,p.owner_id,'Audit paginated walk '||n,p.destination,p.country,p.category,p.price,p.rating,n,p.duration_minutes,p.duration,p.free_cancellation,true,
p.data||jsonb_build_object('id','audit-page-'||n,'title','Audit paginated walk '||n),
jsonb_set(p.schedule,'{exceptions}',CASE WHEN n<=24 THEN jsonb_build_array(jsonb_build_object('date',(now() AT TIME ZONE 'Asia/Colombo')::date+1,'closed',true)) ELSE '[]'::jsonb END),now()
FROM travelbuddy_backend.packages p CROSS JOIN generate_series(1,26) n WHERE p.id='audit-search-2';
SET LOCAL ROLE anon;
DO $$DECLARE result jsonb; d date:=(now() AT TIME ZONE 'Asia/Colombo')::date+1; BEGIN
 result:=travelbuddy_api.catalog(jsonb_build_object('q','Audit paginated walk','date',d));ASSERT (result->>'total')::int=2 AND jsonb_array_length(result->'items')=2,'Inventory filtering precedes pagination';
 result:=travelbuddy_api.catalog(jsonb_build_object('q','Audit Tea Walk','date',d));ASSERT (result->>'total')::int=2,'Date filter uses real future slots';
 result:=travelbuddy_api.catalog(jsonb_build_object('q','Audit Tea Walk','date',d-1));ASSERT (result->>'total')::int=0,'Closed date excluded';
 ASSERT (travelbuddy_api.catalog('{"q":"Audit Tea Walk","duration":"long"}')->>'total')::int=1,'Long duration';
 ASSERT (travelbuddy_api.catalog('{"q":"Audit Tea Walk","duration":"short"}')->>'total')::int=1,'Short duration';
 ASSERT (travelbuddy_api.catalog('{"q":"Audit Tea Walk","live":true}')->>'total')::int=0,'Offline providers excluded';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(travelbuddy_api.search_suggestions('Audit E')) v WHERE v->>'value'='Audit Ella'),'Destination suggestions';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(travelbuddy_api.search_suggestions('Audit Tea Walk')) v WHERE v->>'value'='Audit Tea Walk 3'),'Draft suggestions hidden';
END $$;
RESET ROLE;
INSERT INTO travelbuddy_private.provider_presence(provider_id,accepting,last_seen) VALUES('a5151515-5151-4151-8151-515151515151',true,clock_timestamp());
SET LOCAL ROLE anon;
DO $$BEGIN ASSERT (travelbuddy_api.catalog('{"q":"Audit Tea Walk","live":true}')->>'total')::int=2,'Online Buddy with bookable places';END $$;
RESET ROLE;
-- Reserve all of option zero: the other option must keep the package discoverable.
SELECT set_config('request.jwt.claim.sub','a6161616-6161-4161-8161-616161616162',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN PERFORM travelbuddy_api.checkout(jsonb_build_object('idempotencyKey',gen_random_uuid(),'travelerName','Audit Traveller','travelerEmail','audit@example.test','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'experienceId','audit-search-1','option',0,'date',(now() AT TIME ZONE 'Asia/Colombo')::date+1,'time','09:00','travelers',3))));END $$;
DO $$DECLARE d date:=(now() AT TIME ZONE 'Asia/Colombo')::date+1; BEGIN ASSERT (travelbuddy_api.catalog(jsonb_build_object('q','Audit Tea Walk 1','date',d))->>'total')::int=1,'Search considers all options'; END $$;
DO $$BEGIN PERFORM travelbuddy_api.checkout(jsonb_build_object('idempotencyKey',gen_random_uuid(),'travelerName','Audit Traveller','travelerEmail','audit@example.test','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'experienceId','audit-search-1','option',1,'date',(now() AT TIME ZONE 'Asia/Colombo')::date+1,'time','11:00','travelers',3))));END $$;
DO $$DECLARE d date:=(now() AT TIME ZONE 'Asia/Colombo')::date+1; BEGIN ASSERT (travelbuddy_api.catalog(jsonb_build_object('q','Audit Tea Walk 1','date',d))->>'total')::int=0,'Fully booked date excluded'; END $$;
RESET ROLE;
UPDATE travelbuddy_private.provider_presence SET last_seen=clock_timestamp()-interval '3 minutes' WHERE provider_id='a5151515-5151-4151-8151-515151515151';
SET LOCAL ROLE anon;
DO $$BEGIN ASSERT (travelbuddy_api.catalog('{"q":"Audit Tea Walk","live":true}')->>'total')::int=0,'Expired online lease excluded';END $$;
RESET ROLE;
UPDATE travelbuddy_backend.accounts SET data=jsonb_set(data,'{status}','"suspended"') WHERE id='a5151515-5151-4151-8151-515151515151';
SET LOCAL ROLE anon;
DO $$BEGIN ASSERT travelbuddy_api.search_suggestions('Audit E')='[]','Suspended provider suggestions hidden';END $$;
ROLLBACK;
SELECT 'Discovery parity: filters, inventory, live leases and private suggestions passed.';
