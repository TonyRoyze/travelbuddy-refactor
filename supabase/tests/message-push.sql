-- Run only in the disposable test database; all fixtures roll back.
BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('d1111111-1111-4111-8111-111111111111','d1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"displayName":"Push Sender","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('d2222222-2222-4222-8222-222222222222','d2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"displayName":"Offline Recipient","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('d3333333-3333-4333-8333-333333333333','d3333333-cccc-4ccc-8ccc-cccccccccccc','{"displayName":"Push Outsider","roles":["traveler"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.conversations(id,participant_one_id,participant_two_id,context_key,updated_at)
VALUES('d4444444-4444-4444-8444-444444444444','d1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222','direct',now());
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM travelbuddy_api.register_push_device(repeat('a',64),gen_random_uuid(),'sandbox'); RAISE EXCEPTION 'anonymous device registration'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
SELECT travelbuddy_api.register_push_device(repeat('a',64),'d1111111-0000-4000-8000-000000000001','sandbox');
DO $$ BEGIN
  BEGIN PERFORM * FROM travelbuddy_private.push_devices; RAISE EXCEPTION 'device table exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM travelbuddy_api.claim_message_push('sandbox'); RAISE EXCEPTION 'client claimed jobs'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SET LOCAL ROLE authenticated;
SELECT travelbuddy_api.register_push_device(repeat('b',64),'d2222222-0000-4000-8000-000000000001','sandbox');
SELECT travelbuddy_api.register_push_device(repeat('c',64),'d2222222-0000-4000-8000-000000000002','production');
-- With the complete application schema, explicitly take the recipient offline.
DO $$ BEGIN
  IF to_regprocedure('travelbuddy_api.set_provider_accepting(boolean)') IS NOT NULL THEN
    PERFORM travelbuddy_api.set_provider_accepting(false);
    PERFORM travelbuddy_api.provider_heartbeat();
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3333333-cccc-4ccc-8ccc-cccccccccccc',true);
SET LOCAL ROLE authenticated;
SELECT travelbuddy_api.register_push_device(repeat('d',64),'d3333333-0000-4000-8000-000000000001','sandbox');
-- Unregistering someone else's token has no effect.
SELECT travelbuddy_api.unregister_push_device(repeat('b',64));
RESET ROLE;
INSERT INTO travelbuddy_backend.messages(id,conversation_id,sender_id,recipient_id,body) VALUES
('d5555555-5555-4555-8555-555555555555','d4444444-4444-4444-8444-444444444444','d1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222','Message for the offline recipient');
UPDATE travelbuddy_backend.messages SET body='Attachment update' WHERE id='d5555555-5555-4555-8555-555555555555';
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM travelbuddy_private.message_push_queue WHERE message_id='d5555555-5555-4555-8555-555555555555')=2,'one push per recipient device, no update duplicates';
 ASSERT NOT EXISTS(SELECT 1 FROM travelbuddy_private.message_push_queue WHERE token IN(repeat('a',64),repeat('d',64))),'no sender or outsider push';
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE jobs jsonb; job jsonb; BEGIN
 jobs:=travelbuddy_api.claim_message_push('sandbox');
 ASSERT jsonb_array_length(jobs)=1,'sandbox worker claims only sandbox devices';
 job:=jobs->0;
 ASSERT job->>'recipientUserId'='d2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb','correct authenticated recipient';
 ASSERT NOT (job ? 'body'),'no message contents in jobs';
 ASSERT jsonb_array_length(travelbuddy_api.claim_message_push('sandbox'))=0,'leased jobs cannot be double claimed';
 PERFORM travelbuddy_api.finish_message_push((job->>'id')::uuid,gen_random_uuid(),'sent');
 PERFORM travelbuddy_api.finish_message_push((job->>'id')::uuid,(job->>'leaseId')::uuid,'retry');
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM travelbuddy_private.message_push_queue WHERE token=repeat('b',64) AND completed_at IS NULL AND available_at>now()),'stale acknowledgement ignored and retry deferred';
END $$;
UPDATE travelbuddy_private.message_push_queue SET available_at=now() WHERE token=repeat('b',64);
SET LOCAL ROLE service_role;
DO $$ DECLARE job jsonb; BEGIN
 job:=travelbuddy_api.claim_message_push('sandbox')->0;
 PERFORM travelbuddy_api.finish_message_push((job->>'id')::uuid,(job->>'leaseId')::uuid,'invalid');
 job:=travelbuddy_api.claim_message_push('production')->0;
 ASSERT job->>'environment'='production','production delivery uses correct APNs environment';
 PERFORM travelbuddy_api.finish_message_push((job->>'id')::uuid,(job->>'leaseId')::uuid,'sent');
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM travelbuddy_private.push_devices WHERE token=repeat('b',64)),'invalid device removed';
 ASSERT EXISTS(SELECT 1 FROM travelbuddy_private.message_push_queue WHERE token=repeat('c',64) AND completed_at IS NOT NULL),'successful delivery recorded';
END $$;
SELECT set_config('request.jwt.claim.sub','d2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SET LOCAL ROLE authenticated;
-- Token rotation removes the old token and its queue.
SELECT travelbuddy_api.register_push_device(repeat('e',64),'d2222222-0000-4000-8000-000000000002','production');
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM travelbuddy_private.push_devices WHERE token=repeat('c',64)),'rotated token removed';
END $$;
SELECT set_config('request.jwt.claim.sub','d3333333-cccc-4ccc-8ccc-cccccccccccc',true);
SET LOCAL ROLE authenticated;
-- Signing into another account on the same phone transfers its registration.
SELECT travelbuddy_api.register_push_device(repeat('e',64),'d2222222-0000-4000-8000-000000000002','production');
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT user_id FROM travelbuddy_private.push_devices WHERE token=repeat('e',64))='d3333333-cccc-4ccc-8ccc-cccccccccccc'::uuid,'account switch transfers device';
 ASSERT NOT EXISTS(SELECT 1 FROM travelbuddy_private.message_push_queue WHERE token=repeat('e',64)),'old account jobs removed';
END $$;
SET LOCAL ROLE authenticated;
SELECT travelbuddy_api.unregister_push_device(repeat('e',64));
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM travelbuddy_private.push_devices WHERE token=repeat('e',64)),'sign-out revokes own device';
END $$;
ROLLBACK;
SELECT 'iPhone message push queue and authorization checks passed';
