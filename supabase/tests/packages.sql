BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('a1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111112','{"displayName":"Editor Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('a4444444-4444-4444-8444-444444444444','a4444444-4444-4444-8444-444444444445','{"displayName":"Other Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222223','{"displayName":"Editor Traveller","roles":["traveler"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.media_assets(id,owner_id,storage_path,mime_type,bytes) VALUES('a3333333-3333-4333-8333-333333333333','a1111111-1111-4111-8111-111111111111','editor/test.png','image/png',100);
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111112',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE raw jsonb; saved jsonb; id text; day date:=(now() AT TIME ZONE 'Asia/Colombo')::date+1; result jsonb; BEGIN
raw:=jsonb_build_object('title','Test editor walk','destination','Ella','country','Sri Lanka','category','Tours & sightseeing','description','An easy tea trail with a local host.','durationMinutes',120,'languages',jsonb_build_array('English'),'imageIds','[]'::jsonb,'videoIds','[]'::jsonb,'highlights','[]'::jsonb,'included','[]'::jsonb,'notIncluded','[]'::jsonb,'meetingPoint','Station','freeCancellation',true,'pickup',false,'options',jsonb_build_array(jsonb_build_object('name','Morning walk','price',25,'capacity',6,'times',jsonb_build_array('09:00'))),'itinerary','[]'::jsonb,'published',false,'schedule',jsonb_build_object('startDate',day,'endDate',day+180,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'exceptions','[]'::jsonb));
saved:=travelbuddy_api.save_buddy_package(raw);id:=saved->>'id';
ASSERT (saved->>'revision')::int=1,'Draft revision';
ASSERT jsonb_array_length(travelbuddy_api.buddy_packages())=1,'Own package list';
BEGIN PERFORM travelbuddy_api.package_detail(id);RAISE EXCEPTION 'Draft was public';EXCEPTION WHEN no_data_found THEN NULL;END;
raw:=saved->'input'||'{"published":true}';
BEGIN PERFORM travelbuddy_api.save_buddy_package(raw,id);RAISE EXCEPTION 'Published without cover';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Complete%';END;
raw:=raw||'{"imageIds":["a3333333-3333-4333-8333-333333333333"]}';saved:=travelbuddy_api.save_buddy_package(raw,id);
ASSERT travelbuddy_api.package_detail(id)->>'supplier'='Editor Buddy','Host derived from auth';
BEGIN PERFORM travelbuddy_api.save_buddy_package(raw,id);RAISE EXCEPTION 'Stale revision accepted';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
PERFORM set_config('test.editor_id',id,true);
PERFORM set_config('test.editor_input',(saved->'input')::text,true);
-- Manufacture a real reservation through the same checkout API used by clients.
PERFORM set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222223',true);
result:=travelbuddy_api.checkout(jsonb_build_object('idempotencyKey',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'experienceId',id,'date',day,'time','09:00','option',0,'travelers',3)),'travelerName','Test Traveller','travelerEmail','traveler@example.test'));
PERFORM set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111112',true);
ASSERT jsonb_array_length(travelbuddy_api.package_reservations(id))=1,'Reserved places visible';
raw:=saved->'input';
BEGIN PERFORM travelbuddy_api.save_buddy_package(jsonb_set(raw,'{options,0,capacity}','2'),id);RAISE EXCEPTION 'Capacity shrank below reservations';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
BEGIN PERFORM travelbuddy_api.save_buddy_package(jsonb_set(raw,'{options,0,name}','"Different option"'),id);RAISE EXCEPTION 'Booked option renamed';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
BEGIN PERFORM travelbuddy_api.save_buddy_package(jsonb_set(raw,'{schedule,weekdays}','[]'),id);RAISE EXCEPTION 'Booked date closed';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
saved:=travelbuddy_api.save_buddy_package(raw||'{"published":false}',id);ASSERT NOT (saved->'input'->>'published')::boolean,'Unpublish preserves reservations';
PERFORM set_config('request.jwt.claim.sub','a4444444-4444-4444-8444-444444444445',true);
BEGIN PERFORM travelbuddy_api.buddy_package(id);RAISE EXCEPTION 'Other Buddy read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
BEGIN PERFORM travelbuddy_api.save_buddy_package(raw,id);RAISE EXCEPTION 'Other Buddy update';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
BEGIN PERFORM travelbuddy_api.save_buddy_package(raw);RAISE EXCEPTION 'Foreign photo attached';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
PERFORM set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222223',true);
BEGIN PERFORM travelbuddy_api.buddy_packages();RAISE EXCEPTION 'Traveller editor access';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
BEGIN PERFORM travelbuddy_api.save_buddy_package(raw,id);RAISE EXCEPTION 'Traveller update';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
BEGIN PERFORM travelbuddy_api.commit_package_upload('a1111111-1111-4111-8111-111111111112','{}');RAISE EXCEPTION 'Untrusted registration';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
ROLLBACK;
SELECT 'Package editor: drafts, publishing, revisions, ownership and booked-slot protection passed.';
