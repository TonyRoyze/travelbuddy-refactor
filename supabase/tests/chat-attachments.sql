-- Run only against the disposable travelbuddy_refactor_test database.
BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('a1111111-1111-4111-8111-111111111111','a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"displayName":"Chat Traveler","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('a2222222-2222-4222-8222-222222222222','a2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"displayName":"Chat Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('a3333333-3333-4333-8333-333333333333','a3333333-cccc-4ccc-8ccc-cccccccccccc','{"displayName":"Chat Outsider","roles":["traveler"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
SELECT 'chat-attachment-test-pack','a2222222-2222-4222-8222-222222222222','Chat test tour',destination,country,category,42,rating,duration_minutes,duration,true,true,
data||'{"id":"chat-attachment-test-pack","title":"Chat test tour","description":"A local experience"}',schedule,now() FROM travelbuddy_backend.packages LIMIT 1;
INSERT INTO travelbuddy_backend.conversations(id,participant_one_id,participant_two_id,context_key,package_id,updated_at)
VALUES('a4444444-4444-4444-8444-444444444444','a1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222','package:chat-attachment-test-pack','chat-attachment-test-pack',now());
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('chat-files','a4444444-4444-4444-8444-444444444444/a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test-image','{"mimetype":"image/png","size":1234}');
SELECT set_config('request.jwt.claim.sub','a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 ASSERT travelbuddy_private.chat_file_access('a4444444-4444-4444-8444-444444444444/a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test-image',true),'sender may upload';
 PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','','[{"path":"a4444444-4444-4444-8444-444444444444/a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test-image","name":"station.png","type":"application/x-fake","size":9999}]');
 result:=travelbuddy_api.messages('a4444444-4444-4444-8444-444444444444')->0;
 ASSERT result->'attachments'->0->>'type'='image/png','MIME comes from storage';
 ASSERT (result->'attachments'->0->>'size')::int=1234,'size comes from storage';
 ASSERT NOT travelbuddy_private.chat_file_access('a4444444-4444-4444-8444-444444444444/a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test-image',true),'sent files cannot be overwritten or removed';
 BEGIN PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','','[]','chat-attachment-test-pack'); RAISE EXCEPTION 'traveler shared package'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','','[{"path":"elsewhere/file","name":"bad.png"}]'); RAISE EXCEPTION 'foreign file accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','','[]'); RAISE EXCEPTION 'empty accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='empty accepted' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id='chat-files')=1,'recipient can read attachment';
 ASSERT NOT travelbuddy_private.chat_file_access('a4444444-4444-4444-8444-444444444444/a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test-image',true),'recipient cannot replace sender file';
 PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','','[]','chat-attachment-test-pack');
 SELECT value INTO result FROM jsonb_array_elements(travelbuddy_api.messages('a4444444-4444-4444-8444-444444444444')) WHERE value->'package'->>'id'='chat-attachment-test-pack';
 ASSERT result->'package'->>'title'='Chat test tour','server builds package snapshot';
 ASSERT result->'package'->>'currency'='LKR','transaction currency retained';
 BEGIN PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','','[]','not-owned'); RAISE EXCEPTION 'foreign package shared'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a3333333-cccc-4ccc-8ccc-cccccccccccc',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id='chat-files')=0,'outsider cannot read files';
 ASSERT NOT travelbuddy_private.chat_file_access('a4444444-4444-4444-8444-444444444444/a3333333-cccc-4ccc-8ccc-cccccccccccc/new',true),'outsider cannot upload';
 BEGIN PERFORM travelbuddy_api.send_chat_message('a4444444-4444-4444-8444-444444444444','attack'); RAISE EXCEPTION 'outsider sent'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM travelbuddy_api.messages('a4444444-4444-4444-8444-444444444444'); RAISE EXCEPTION 'outsider read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Chat attachment and package sharing checks passed';
