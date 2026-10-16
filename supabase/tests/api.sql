-- Run only against the disposable travelbuddy_refactor_test database.
BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"displayName":"Maya","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"displayName":"Ravi","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','{"displayName":"Other","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('44444444-4444-4444-8444-444444444444','dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"displayName":"Suspended","roles":["traveler"],"status":"suspended","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
SELECT 'refactor-test-pack','22222222-2222-4222-8222-222222222222',title,destination,country,category,price,rating,duration_minutes,duration,true,true,
data||jsonb_build_object('id','refactor-test-pack','freeCancellation',true,'options',jsonb_build_array(jsonb_build_object('name','Test tour','price',42,'duration','3 hours','detail','Small group','times',jsonb_build_array('23:59'),'capacity',2))),
jsonb_build_object('startDate',current_date,'endDate',current_date+180,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'exceptions','[]'::jsonb),now() FROM travelbuddy_backend.packages LIMIT 1;
SET LOCAL ROLE anon;
DO $$ BEGIN
 ASSERT (travelbuddy_api.catalog('{}')->>'total')::int>0,'anonymous catalog';
 ASSERT NOT (travelbuddy_api.package_detail('refactor-test-pack') ? 'owner_id'),'private fields';
 BEGIN PERFORM travelbuddy_api.account(); RAISE EXCEPTION 'anonymous auth bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM travelbuddy_backend.accounts; RAISE EXCEPTION 'private table exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claims','{"email":"maya@example.com","user_metadata":{"roles":["admin"]}}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE a jsonb; booking jsonb; replay jsonb; input jsonb; thread uuid; slots jsonb;
BEGIN
 a:=travelbuddy_api.account(); ASSERT a->>'displayName'='Maya','existing identity'; ASSERT a->'roles'='["traveler"]','metadata escalation';
 BEGIN PERFORM travelbuddy_api.onboard('Maya','buddy',1); RAISE EXCEPTION 'role replay accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 slots:=travelbuddy_api.availability('refactor-test-pack',current_date,0,1); ASSERT NOT (slots->'slots' @> '[{"time":"00:00"}]'),'past slot';
 input:=jsonb_build_object('idempotencyKey','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','travelerName','Maya Traveler','travelerEmail','maya@example.com','items',jsonb_build_array(jsonb_build_object('id','ffffffff-ffff-4fff-8fff-ffffffffffff','experienceId','refactor-test-pack','option',0,'date',(current_date+2)::text,'time','23:59','travelers',2)));
 booking:=travelbuddy_api.checkout(input); ASSERT (booking->0->>'total')::numeric=84,'server price';
 replay:=travelbuddy_api.checkout(input); ASSERT booking=replay,'checkout idempotency';
 BEGIN PERFORM travelbuddy_api.checkout(input||'{"travelerName":"Different name"}'); RAISE EXCEPTION 'conflicting retry'; EXCEPTION WHEN unique_violation THEN NULL; END;
 slots:=travelbuddy_api.availability('refactor-test-pack',current_date+2,0,1); ASSERT slots->'next'->>'date'=(current_date+3)::text,'sold-out fallback';
 BEGIN PERFORM travelbuddy_api.checkout(jsonb_set(input,'{idempotencyKey}','"99999999-9999-4999-8999-999999999999"')); RAISE EXCEPTION 'overbooked'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='overbooked' THEN RAISE; END IF; END;
 ASSERT jsonb_array_length(travelbuddy_api.bookings())=1,'booking listing';
 PERFORM travelbuddy_api.cancel_booking((booking->0->>'id')::uuid);
 ASSERT travelbuddy_api.bookings()->0->>'status'='Cancelled','cancellation';
 thread:=travelbuddy_api.start_chat('refactor-test-pack'); ASSERT thread=travelbuddy_api.start_chat('refactor-test-pack'),'thread reuse';
 PERFORM set_config('test.thread',thread::text,true);
 PERFORM travelbuddy_api.send_message(thread,'Hello Ravi'); ASSERT jsonb_array_length(travelbuddy_api.messages(thread))=1,'message persistence';
 ASSERT jsonb_array_length(travelbuddy_api.bookings())=1,'chat creates no booking';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT jsonb_array_length(travelbuddy_api.messages(current_setting('test.thread')::uuid))=1,'provider sees message';
 PERFORM travelbuddy_api.send_message(current_setting('test.thread')::uuid,'Hello Maya');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT travelbuddy_api.conversations()='[]','outsider list privacy';
 BEGIN PERFORM travelbuddy_api.messages(current_setting('test.thread')::uuid); RAISE EXCEPTION 'outsider read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM travelbuddy_api.send_message(current_setting('test.thread')::uuid,'attack'); RAISE EXCEPTION 'outsider write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM travelbuddy_api.account(); RAISE EXCEPTION 'suspended access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb; BEGIN
 a:=travelbuddy_api.account(); ASSERT a->>'onboarding'='pending','new user';
 BEGIN PERFORM travelbuddy_api.onboard('Attacker','admin',1); RAISE EXCEPTION 'admin signup'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='admin signup' THEN RAISE; END IF; END;
 a:=travelbuddy_api.onboard('New Buddy','buddy',1); ASSERT a->'roles'='["provider"]' AND (a->>'revision')::int=2,'onboarding';
END $$;
RESET ROLE;
-- Explicit closed exception overrides weekdays and fallback skips it.
UPDATE travelbuddy_backend.packages SET schedule=jsonb_set(schedule,'{exceptions}',jsonb_build_array(jsonb_build_object('date',current_date+1,'closed',true))) WHERE id='refactor-test-pack';
DO $$ BEGIN ASSERT travelbuddy_api.availability('refactor-test-pack',current_date+1)->'slots'='[]','closed date'; END $$;
ROLLBACK;
SELECT 'API authorization, booking, scheduling, onboarding and messaging checks passed';
