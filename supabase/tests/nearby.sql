BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('10101010-1010-4010-8010-101010101010','a1010101-1010-4010-8010-101010101010','{"displayName":"Live host","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('20202020-2020-4020-8020-202020202020','b2020202-2020-4020-8020-202020202020','{"displayName":"Traveler","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('30303030-3030-4030-8030-303030303030','c3030303-3030-4030-8030-303030303030','{"displayName":"Other host","roles":["provider"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
SELECT 'nearby-test-pack','10101010-1010-4010-8010-101010101010',title,'Ella test area',country,category,price,rating,duration_minutes,duration,true,true,
data||'{"id":"nearby-test-pack"}',schedule,now() FROM travelbuddy_backend.packages LIMIT 1;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM travelbuddy_api.provider_discovery(); RAISE EXCEPTION 'anonymous provider access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM travelbuddy_private.provider_presence; RAISE EXCEPTION 'private presence exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM travelbuddy_private.meeting_points; RAISE EXCEPTION 'private location table exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','b2020202-2020-4020-8020-202020202020',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM travelbuddy_api.set_provider_accepting(true); RAISE EXCEPTION 'traveler went live'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1010101-1010-4010-8010-101010101010',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE state jsonb; BEGIN
 state:=travelbuddy_api.provider_discovery(); ASSERT NOT (state->'presence'->>'online')::boolean,'offline initially';
 PERFORM travelbuddy_api.set_provider_accepting(true);
 ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Ella test area')->'items')=0,'no invented meeting points';
 PERFORM travelbuddy_api.save_meeting_point('{"packageId":"nearby-test-pack","area":" Ella   test area ","label":"Ella station","latitude":6.87,"longitude":81.05}');
 ASSERT travelbuddy_api.nearby_areas() @> '["Ella test area"]','saved town can be chosen';
 ASSERT jsonb_array_length(travelbuddy_api.nearby_live('ELLA TEST AREA')->'items')=1,'town normalization';
 ASSERT travelbuddy_api.nearby_live('Ella test area')->'items'->0->'location'->>'label'='Ella station','published meeting point';
 ASSERT travelbuddy_api.package_detail('nearby-test-pack')->>'meetingPoint'='Ella station','booking description stays in sync';
 ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Other town')->'items')=0,'town isolation';
 BEGIN PERFORM travelbuddy_api.save_meeting_point('{"packageId":"nearby-test-pack","area":"Ella","label":"Station","latitude":91,"longitude":81}'); RAISE EXCEPTION 'invalid coordinates accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='invalid coordinates accepted' THEN RAISE; END IF; END;
 PERFORM travelbuddy_api.set_provider_accepting(false);
 PERFORM travelbuddy_api.provider_heartbeat();
 ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Ella test area')->'items')=0,'heartbeat cannot override manual off';
 PERFORM travelbuddy_api.set_provider_accepting(true);
END $$;
RESET ROLE;
UPDATE travelbuddy_private.provider_presence SET last_seen=clock_timestamp()-interval '3 minutes' WHERE provider_id='10101010-1010-4010-8010-101010101010';
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Ella test area')->'items')=0,'stale provider expires'; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1010101-1010-4010-8010-101010101010',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM travelbuddy_api.provider_heartbeat();
 ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Ella test area')->'items')=1,'active provider renews lease';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','c3030303-3030-4030-8030-303030303030',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM travelbuddy_api.save_meeting_point('{"packageId":"nearby-test-pack","area":"Stolen","label":"Station","latitude":6,"longitude":80}'); RAISE EXCEPTION 'other host edited meeting point'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 ASSERT jsonb_array_length(travelbuddy_api.provider_discovery()->'packages')=0,'provider package ownership';
END $$;
RESET ROLE;
UPDATE travelbuddy_backend.accounts SET data=jsonb_set(data,'{status}','"suspended"') WHERE id='10101010-1010-4010-8010-101010101010';
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Ella test area')->'items')=0,'suspended host hidden'; END $$;
RESET ROLE;
UPDATE travelbuddy_backend.accounts SET data=jsonb_set(data,'{status}','"active"') WHERE id='10101010-1010-4010-8010-101010101010';
UPDATE travelbuddy_backend.packages SET published=false WHERE id='nearby-test-pack';
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT jsonb_array_length(travelbuddy_api.nearby_live('Ella test area')->'items')=0,'unpublished listing hidden'; END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Nearby discovery passed: ownership, private tables, town filtering, saved points, heartbeat expiry, manual off, suspension and unpublishing.';
