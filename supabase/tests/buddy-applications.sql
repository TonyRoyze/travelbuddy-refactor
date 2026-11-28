BEGIN;
DO $$ BEGIN
  IF current_database() <> 'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF;
END $$;

-- The disposable DB uses JWT helper stubs and may omit GoTrue's users table.
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);

INSERT INTO travelbuddy_backend.accounts(id, supabase_user_id, data, updated_at) VALUES
('135d2cf2-28e2-48cf-9f98-57d72c47df3c', 'fbbcf325-99f4-4315-9cb8-dabe6a44f0d9',
 '{"displayName":"Traveler","roles":["traveler"],"status":"active","onboarding":"pending"}', now());

SELECT set_config('request.jwt.claim.sub','fbbcf325-99f4-4315-9cb8-dabe6a44f0d9',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  application jsonb := '{"displayName":"Host","legalName":"Test Host","birthDate":"1990-02-10","phone":"077 123 4567","documentType":"nic","service":"local","homeBase":"Galle","languages":"Sinhala","intro":"Local walks"}';
  sample jsonb := jsonb_build_object('type', 'image/png', 'base64', encode(decode('89504e470d0a1a0a00000000','hex'), 'base64'));
  images jsonb := jsonb_build_object('id-front', sample, 'id-back', sample, 'selfie', sample);
BEGIN
  ASSERT travelbuddy_api.buddy_application_status() IS NULL;
  BEGIN
    PERFORM travelbuddy_api.onboard('Applicant', 'admin', (travelbuddy_api.account()->>'revision')::int);
    ASSERT false, 'onboarding granted admin';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'Enter a name and choose Traveller, or submit a buddy application.';
  END;
  BEGIN
    PERFORM travelbuddy_api.admin_list_buddy_applications();
    ASSERT false, 'applicant read the admin queue';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_api.claim_buddy_verification_job();
    ASSERT false, 'applicant claimed a verification job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_api.submit_buddy_application(application || '{"birthDate":"2020-01-01"}', images);
    RAISE EXCEPTION 'underage application accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_api.submit_buddy_application(application, images - 'id-back');
    RAISE EXCEPTION 'incomplete NIC accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_api.submit_buddy_application(application, jsonb_set(images, '{selfie,type}', '"text/html"'));
    RAISE EXCEPTION 'invalid MIME accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ASSERT travelbuddy_api.buddy_application_status() IS NULL, 'invalid submission left a pending application';
  ASSERT travelbuddy_api.submit_buddy_application(application, images)->>'status' = 'pending';
  ASSERT travelbuddy_api.submit_buddy_application(application, images)->>'status' = 'pending', 'retry should be idempotent';
  BEGIN
    PERFORM travelbuddy_api.onboard('Applicant', 'traveler', (travelbuddy_api.account()->>'revision')::int);
    ASSERT false, 'applicant bypassed pending buddy verification';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM = 'Your buddy application is under review.';
  END;
  ASSERT travelbuddy_api.account()->'roles' = '["traveler"]', 'submission granted hosting';
  BEGIN
    PERFORM 1 FROM travelbuddy_private.buddy_application_images;
    RAISE EXCEPTION 'identity evidence exposed to applicant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_private.review_buddy_application('135d2cf2-28e2-48cf-9f98-57d72c47df3c', now(), true, 'Applicant');
    RAISE EXCEPTION 'self-approval allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('test.application', application::text, true);
  PERFORM set_config('test.images', images::text, true);
END $$;

SELECT set_config('request.jwt.claim.sub','116cbf32-162e-4b97-a5c6-64814cdff2ad',true);
DO $$ BEGIN ASSERT travelbuddy_api.buddy_application_status() IS NULL, 'other applicant read status'; END $$;
RESET ROLE;
DO $$
DECLARE b travelbuddy_private.buddy_applications;
BEGIN
  SELECT * INTO b FROM travelbuddy_private.buddy_applications WHERE account_id = '135d2cf2-28e2-48cf-9f98-57d72c47df3c';
  PERFORM set_config('test.previous_submission', b.submitted_at::text, true);
  PERFORM travelbuddy_private.review_buddy_application(b.account_id, b.submitted_at, false, 'Reviewer', 'Provide a clearer NIC photograph.');
  ASSERT NOT EXISTS (SELECT 1 FROM travelbuddy_private.buddy_application_images WHERE account_id = b.account_id);
END $$;
SELECT set_config('request.jwt.claim.sub','fbbcf325-99f4-4315-9cb8-dabe6a44f0d9',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT travelbuddy_api.buddy_application_status()->>'message' = 'Provide a clearer NIC photograph.';
  ASSERT travelbuddy_api.submit_buddy_application(current_setting('test.application')::jsonb, current_setting('test.images')::jsonb)->>'status' = 'pending';
END $$;
RESET ROLE;
DO $$
DECLARE b travelbuddy_private.buddy_applications;
BEGIN
  SELECT * INTO b FROM travelbuddy_private.buddy_applications WHERE account_id = '135d2cf2-28e2-48cf-9f98-57d72c47df3c';
  BEGIN
    PERFORM travelbuddy_private.review_buddy_application(b.account_id, current_setting('test.previous_submission')::timestamptz, true, 'Reviewer');
    RAISE EXCEPTION 'stale review accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  PERFORM travelbuddy_private.review_buddy_application(b.account_id, b.submitted_at, true, 'Reviewer');
  ASSERT NOT EXISTS (SELECT 1 FROM travelbuddy_private.buddy_application_images WHERE account_id = b.account_id);
  ASSERT (SELECT details FROM travelbuddy_private.buddy_applications WHERE account_id = b.account_id) = '{"service":"local"}';
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT travelbuddy_api.buddy_application_status()->>'status' = 'approved';
  ASSERT travelbuddy_api.account()->'roles' = '["guide"]';
  ASSERT travelbuddy_api.account()->>'onboarding' = 'completed';
  BEGIN
    PERFORM travelbuddy_api.save_profile('{"displayName":"Host","profileDetails":{},"roles":["admin"]}',
      (travelbuddy_api.account()->>'revision')::int);
    ASSERT false, 'profile save granted admin';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'Check your profile details.';
  END;
END $$;
-- An existing host can reapply without changing their public account.
DO $$
DECLARE application jsonb := current_setting('test.application')::jsonb;
BEGIN
  application := application || '{"displayName":"Changed name","faceComparisonConsent":true}';
  ASSERT travelbuddy_api.submit_buddy_application(application, current_setting('test.images')::jsonb)->>'status' = 'pending';
  ASSERT travelbuddy_api.account()->'roles' = '["guide"]';
  ASSERT travelbuddy_api.account()->>'displayName' = 'Host';
END $$;
RESET ROLE;
DO $$
DECLARE b travelbuddy_private.buddy_applications;
BEGIN
  SELECT * INTO b FROM travelbuddy_private.buddy_applications WHERE account_id = '135d2cf2-28e2-48cf-9f98-57d72c47df3c';
  ASSERT b.details->'faceComparisonConsent' = 'true'::jsonb;
  PERFORM travelbuddy_private.review_buddy_application(b.account_id, b.submitted_at, true, 'Reviewer');
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT travelbuddy_api.buddy_application_status()->>'status' = 'approved';
  ASSERT travelbuddy_api.account()->>'displayName' = 'Host';
  ASSERT travelbuddy_api.account()->'roles' = '["guide"]';
END $$;

RESET ROLE;
INSERT INTO travelbuddy_backend.accounts (id, supabase_user_id, data) VALUES
('baecef71-e04c-4ddb-ab0d-b2eac433a606', '54d89ba5-0b67-42b5-bf4d-98c90093144a',
 '{"displayName":"Administrator","roles":["traveler"],"status":"active","onboarding":"completed"}');
DO $$
DECLARE
  role_name text;
BEGIN
  ASSERT travelbuddy_private.set_account_admin('baecef71-e04c-4ddb-ab0d-b2eac433a606', true) = '["traveler","admin"]';
  ASSERT travelbuddy_private.set_account_admin('baecef71-e04c-4ddb-ab0d-b2eac433a606', true) = '["traveler","admin"]';
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(role_name, 'travelbuddy_private.set_account_admin(uuid,boolean)', 'EXECUTE');
    ASSERT NOT has_function_privilege(role_name,
      'travelbuddy_private.review_buddy_application(uuid,timestamptz,boolean,text,text)', 'EXECUTE');
    ASSERT NOT has_function_privilege(role_name,
      'travelbuddy_private.decide_buddy_application(uuid,timestamptz,text,text,text,jsonb,text)', 'EXECUTE');
    ASSERT NOT has_table_privilege(role_name, 'travelbuddy_private.buddy_verification_runs', 'SELECT');
    ASSERT NOT has_table_privilege(role_name, 'travelbuddy_private.buddy_verification_jobs', 'UPDATE');
    ASSERT NOT has_table_privilege(role_name, 'travelbuddy_private.buddy_credentials', 'SELECT');
  END LOOP;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  application jsonb := current_setting('test.application')::jsonb ||
    '{"faceComparisonConsent":true,"livenessSessionId":"session-1","nicNumber":"123456789-v"}';
  images jsonb := current_setting('test.images')::jsonb;
  image jsonb := jsonb_build_object('type', 'image/png',
    'base64', replace(encode(decode('89504e470d0a1a0a' || repeat('00', 80), 'hex'), 'base64'), E'\n', ''));
  submission jsonb;
  kind text;
BEGIN
  BEGIN
    PERFORM travelbuddy_api.submit_buddy_application(application || '{"nicNumber":"wrong"}', images);
    ASSERT false, 'invalid NIC accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_api.submit_buddy_application(application, images || jsonb_build_object('owner-authorization', image));
    ASSERT false, 'non-transport application accepted owner authorization';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  FOR kind IN SELECT jsonb_object_keys(images) LOOP
    images := jsonb_set(images, ARRAY[kind], image);
  END LOOP;
  submission := travelbuddy_api.submit_buddy_application(application, images);
  ASSERT submission->>'status' = 'pending';
  ASSERT (submission->>'canReapply')::boolean = false;
  ASSERT submission->'expiringDocs' = '[]';
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE job jsonb := travelbuddy_api.claim_buddy_verification_job();
BEGIN
  ASSERT job->>'attempts' = '1';
  ASSERT job->>'livenessSessionId' = 'session-1';
  ASSERT job#>>'{details,nicNumber}' = '123456789V';
  ASSERT position(E'\n' IN (job#>>'{images,id-front,base64}')) = 0;
  ASSERT travelbuddy_api.claim_buddy_verification_job() IS NULL, 'job claimed twice';
  ASSERT travelbuddy_api.get_buddy_application_image((job->>'accountId')::uuid, 'selfie') = job#>'{images,selfie}';
  BEGIN
    PERFORM travelbuddy_api.admin_list_buddy_applications();
    ASSERT false, 'worker read the admin queue';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM travelbuddy_api.complete_buddy_verification_job((job->>'jobId')::uuid, gen_random_uuid(), '{}');
    ASSERT false, 'worker completed a job using an unrelated lease';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  ASSERT travelbuddy_api.complete_buddy_verification_job((job->>'jobId')::uuid, (job->>'leaseId')::uuid,
    '{"effectiveStatus":"changes_requested","decisionBucket":"red","shadowMode":false,
      "pipelineVersion":"test","providerMode":"option_a_inhouse","livenessStatus":"failed",
      "extractedSummary":{},"ruleOutcomes":[{"code":"BIO-01","status":"red","message":"Test"}],
      "applicantFeedback":"Upload a clear photo.","latencyMs":5}')
    = '{"applied":true,"stale":false,"status":"changes_requested"}';
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb := travelbuddy_api.buddy_application_status();
BEGIN
  ASSERT result->>'message' = 'Upload a clear photo.';
  ASSERT result->>'canAppeal' = 'true';
  ASSERT result->>'canReapply' = 'true';
  result := travelbuddy_api.request_buddy_manual_review();
  ASSERT result->>'status' = 'manual_review';
  ASSERT result->>'message' IS NULL;
  ASSERT result->>'appealRequestedAt' IS NOT NULL;
  ASSERT result->>'canAppeal' = 'false';
  BEGIN
    PERFORM travelbuddy_api.request_buddy_manual_review();
    ASSERT false, 'a second appeal was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
DO $$
DECLARE
  applicant constant uuid := '135d2cf2-28e2-48cf-9f98-57d72c47df3c';
  queue jsonb := travelbuddy_api.admin_list_buddy_applications('needs_review');
  detail jsonb := travelbuddy_api.admin_get_buddy_application(applicant);
  submission timestamptz := (detail->>'submittedAt')::timestamptz;
  result jsonb;
BEGIN
  ASSERT queue#>>'{0,accountId}' = applicant::text;
  ASSERT queue#>'{0,email}' = 'null';
  ASSERT queue#>>'{0,latestRun,redCount}' = '1';
  ASSERT detail#>>'{runs,0,ruleOutcomes,0,code}' = 'BIO-01';
  ASSERT NOT (detail->'credentials' ?| ARRAY['nic_hmac', 'nicHmac', 'dl_hmac', 'dlHmac']);
  ASSERT position(E'\n' IN (travelbuddy_api.admin_buddy_application_image(applicant, 'selfie')->>'base64')) = 0;
  BEGIN
    PERFORM travelbuddy_api.admin_review_buddy_application(applicant, submission, 'rejected');
    ASSERT false, 'rejection without a reason accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ASSERT travelbuddy_api.admin_requeue_buddy_verification(applicant)->>'status' = 'queued';
  result := travelbuddy_api.admin_review_buddy_application(applicant, submission, 'rejected', 'Evidence was insufficient.');
  ASSERT result->>'reviewedBy' = 'admin:baecef71-e04c-4ddb-ab0d-b2eac433a606';
  ASSERT result->>'status' = 'rejected';
  ASSERT travelbuddy_api.admin_buddy_application_image(applicant, 'selfie') IS NULL;
  ASSERT travelbuddy_api.admin_get_buddy_application(applicant)->'details' = '{"service":"local"}';
  ASSERT travelbuddy_api.admin_list_buddy_applications('needs_review') = '[]';
END $$;

SELECT set_config('request.jwt.claim.sub', 'fbbcf325-99f4-4315-9cb8-dabe6a44f0d9', true);
DO $$
DECLARE
  result jsonb := travelbuddy_api.buddy_application_status();
  application jsonb := current_setting('test.application')::jsonb ||
    '{"service":"transport","faceComparisonConsent":true,"thirdPartyVehicle":true}';
  images jsonb := current_setting('test.images')::jsonb;
  image jsonb := images->'selfie';
BEGIN
  ASSERT result->>'status' = 'rejected';
  ASSERT result->>'canReapply' = 'true';
  ASSERT result->>'canAppeal' = 'false';
  ASSERT travelbuddy_api.account()->'roles' = '["guide"]';
  BEGIN
    PERFORM travelbuddy_api.submit_buddy_application(application, images);
    ASSERT false, 'transport application accepted without transport documents';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  images := images || jsonb_build_object('driving-licence-front', image, 'driving-licence-back', image,
    'vehicle', image, 'insurance', image, 'revenue-licence', image, 'owner-authorization', image);
  ASSERT travelbuddy_api.submit_buddy_application(application, images)->>'status' = 'pending';
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE job jsonb := travelbuddy_api.claim_buddy_verification_job();
BEGIN
  ASSERT job#>>'{details,thirdPartyVehicle}' = 'true';
  ASSERT job#>'{images,owner-authorization}' IS NOT NULL;
  ASSERT travelbuddy_api.fail_buddy_verification_job((job->>'jobId')::uuid, (job->>'leaseId')::uuid, repeat('a', 510))
    = '{"escalatedToManualReview":false,"attempts":1}';
  ASSERT travelbuddy_api.claim_buddy_verification_job() IS NULL, 'retry ignored the delay';
END $$;
RESET ROLE;
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM travelbuddy_private.buddy_verification_jobs
    WHERE status = 'queued' AND attempts = 1 AND length(last_error) = 500
      AND available_at = now() + interval '15 seconds');
  UPDATE travelbuddy_private.buddy_verification_jobs SET available_at = now()
    WHERE status = 'queued' AND attempts = 1;
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE job jsonb := travelbuddy_api.claim_buddy_verification_job();
BEGIN
  ASSERT job->>'attempts' = '2';
  ASSERT travelbuddy_api.fail_buddy_verification_job((job->>'jobId')::uuid, (job->>'leaseId')::uuid, 'Unavailable', 2)
    = '{"escalatedToManualReview":true,"attempts":2}';
END $$;
RESET ROLE;
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM travelbuddy_private.buddy_verification_runs
    WHERE decision_bucket = 'amber' AND rule_outcomes @> '[{"code":"SYS-01","status":"amber"}]');
END $$;

SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT travelbuddy_api.admin_requeue_buddy_verification('135d2cf2-28e2-48cf-9f98-57d72c47df3c')->>'status' = 'queued';
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  job jsonb := travelbuddy_api.claim_buddy_verification_job();
  today date := (now() AT TIME ZONE 'Asia/Colombo')::date;
  outcome jsonb := jsonb_build_object(
    'effectiveStatus','approved', 'decisionBucket','green', 'shadowMode',false, 'pipelineVersion','test',
    'providerMode','option_a_inhouse', 'extractedSummary','{}'::jsonb, 'ruleOutcomes','[]'::jsonb, 'latencyMs',1,
    'credentials',jsonb_build_object('service','transport','nicHmac','test-nic-hmac','dlHmac','test-dl-hmac',
      'vehiclePlateNormalized','ABC1234','dlExpiresAt',today + 1,'insuranceExpiresAt',today + 30,'erlExpiresAt',today + 90)
  );
BEGIN
  ASSERT job->>'attempts' = '1', 'requeue did not reset attempts';
  ASSERT travelbuddy_api.complete_buddy_verification_job((job->>'jobId')::uuid, (job->>'leaseId')::uuid, outcome)
    = '{"applied":true,"stale":false,"status":"approved"}';
  ASSERT travelbuddy_api.get_buddy_application_image((job->>'accountId')::uuid, 'selfie') IS NULL;
  ASSERT travelbuddy_api.check_buddy_credential_duplicates(gen_random_uuid(), 'test-nic-hmac', 'ABC1234')
    = '{"duplicateNic":true,"duplicatePlate":true}';
  ASSERT travelbuddy_api.check_buddy_credential_duplicates((job->>'accountId')::uuid, 'test-nic-hmac', 'ABC1234')
    = '{"duplicateNic":false,"duplicatePlate":false}';
END $$;

RESET ROLE;
DO $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Colombo')::date;
BEGIN
  UPDATE travelbuddy_private.buddy_credentials SET dl_expires_at = today
    WHERE account_id = '135d2cf2-28e2-48cf-9f98-57d72c47df3c';
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE sweep jsonb := travelbuddy_api.sweep_buddy_verification_maintenance();
BEGIN
  ASSERT sweep#>>'{expiryNotices,0,stage}' = 'expired';
  ASSERT sweep#>>'{expiryNotices,1,stage}' = '30d';
  ASSERT travelbuddy_api.sweep_buddy_verification_maintenance()->'expiryNotices' = '[]';
END $$;

SELECT set_config('request.jwt.claim.sub', 'fbbcf325-99f4-4315-9cb8-dabe6a44f0d9', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb := travelbuddy_api.buddy_application_status();
BEGIN
  ASSERT result->>'status' = 'approved';
  ASSERT result->>'decisionSource' = 'automated';
  ASSERT result->>'transportEligible' = 'false';
  ASSERT result#>>'{expiringDocs,0,daysRemaining}' = '0';
  ASSERT result#>>'{expiringDocs,1,daysRemaining}' = '30';
END $$;

-- An administrator can decide while the worker holds a lease. Its completion
-- must become stale even if the applicant has already uploaded a replacement.
DO $$ BEGIN
  ASSERT travelbuddy_api.submit_buddy_application(current_setting('test.application')::jsonb,
    current_setting('test.images')::jsonb)->>'status' = 'pending';
END $$;
SET LOCAL ROLE service_role;
SELECT set_config('test.stale_job', travelbuddy_api.claim_buddy_verification_job()::text, true);

SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE job jsonb := current_setting('test.stale_job')::jsonb;
BEGIN
  ASSERT travelbuddy_api.admin_review_buddy_application((job->>'accountId')::uuid,
    (job->>'submittedAt')::timestamptz, 'changes_requested', 'Upload a newer photo.')->>'status' = 'changes_requested';
END $$;
SELECT set_config('request.jwt.claim.sub', 'fbbcf325-99f4-4315-9cb8-dabe6a44f0d9', true);
DO $$ BEGIN
  ASSERT travelbuddy_api.submit_buddy_application(current_setting('test.application')::jsonb,
    current_setting('test.images')::jsonb)->>'status' = 'pending';
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  stale_job jsonb := current_setting('test.stale_job')::jsonb;
  job jsonb;
BEGIN
  ASSERT travelbuddy_api.complete_buddy_verification_job((stale_job->>'jobId')::uuid, (stale_job->>'leaseId')::uuid, '{}')
    = '{"applied":false,"stale":true,"status":"stale"}';
  job := travelbuddy_api.claim_buddy_verification_job();
  ASSERT job->>'submittedAt' <> stale_job->>'submittedAt';
  ASSERT travelbuddy_api.complete_buddy_verification_job((job->>'jobId')::uuid, (job->>'leaseId')::uuid,
    '{"effectiveStatus":"approved","decisionBucket":"green","shadowMode":true,"pipelineVersion":"test",
      "providerMode":"option_a_inhouse","extractedSummary":{},"ruleOutcomes":[],"latencyMs":1}')
    = '{"applied":true,"stale":false,"status":"manual_review"}';
  ASSERT travelbuddy_api.get_buddy_application_image((job->>'accountId')::uuid, 'selfie') IS NOT NULL;
END $$;

-- Age retained automated Red evidence and confirm the sweep disables its appeal.
RESET ROLE;
UPDATE travelbuddy_private.buddy_applications SET status = 'changes_requested', decision_source = 'automated',
  verification_bucket = 'red', submitted_at = now() - interval '15 days'
WHERE account_id = '135d2cf2-28e2-48cf-9f98-57d72c47df3c';

SET LOCAL ROLE service_role;
DO $$ BEGIN
  ASSERT travelbuddy_api.sweep_buddy_verification_maintenance()->>'purgedApplications' = '1';
  ASSERT travelbuddy_api.sweep_buddy_verification_maintenance()->>'purgedApplications' = '0';
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT travelbuddy_api.buddy_application_status()->>'canAppeal' = 'false';
  ASSERT travelbuddy_api.buddy_application_status()->>'canReapply' = 'true';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT details FROM travelbuddy_private.buddy_applications
    WHERE account_id = '135d2cf2-28e2-48cf-9f98-57d72c47df3c') = '{"service":"local"}';
END $$;

RESET ROLE;
DO $$ BEGIN
  ASSERT travelbuddy_private.set_account_admin('baecef71-e04c-4ddb-ab0d-b2eac433a606', false) = '["traveler"]';
END $$;
SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM travelbuddy_api.admin_list_buddy_applications();
    ASSERT false, 'revoked admin retained access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- Traveler onboarding still works for a profile with no buddy application,
-- and completed travelers can submit, reapply after rejection, and receive transport approval.
SELECT set_config('request.jwt.claim.sub', '8f7120e8-b301-4c1e-ada6-203d19daea4f', true);
DO $$
DECLARE
  sample jsonb := current_setting('test.images')::jsonb->'selfie';
  transport_app jsonb := current_setting('test.application')::jsonb || '{"service":"transport"}';
  transport_images jsonb := current_setting('test.images')::jsonb || jsonb_build_object(
    'driving-licence-front', sample, 'driving-licence-back', sample,
    'vehicle', sample, 'insurance', sample, 'revenue-licence', sample
  );
  traveler_account jsonb;
BEGIN
  traveler_account := travelbuddy_api.onboard('Traveler', 'traveler', (travelbuddy_api.account()->>'revision')::int);
  ASSERT traveler_account->>'onboarding' = 'completed';
  PERFORM set_config('test.traveler_id', traveler_account->>'id', true);
  ASSERT travelbuddy_api.submit_buddy_application(transport_app, transport_images)->>'status' = 'pending';
  PERFORM set_config('test.transport_app', transport_app::text, true);
  PERFORM set_config('test.transport_images', transport_images::text, true);
END $$;

-- Concurrent duplicate credential check at job completion intercepts auto-approval.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  job jsonb := travelbuddy_api.claim_buddy_verification_job();
  dup_outcome jsonb := jsonb_build_object(
    'effectiveStatus','approved', 'decisionBucket','green', 'shadowMode',false, 'pipelineVersion','test',
    'providerMode','option_a_inhouse', 'extractedSummary','{}'::jsonb, 'ruleOutcomes','[]'::jsonb, 'latencyMs',2,
    'credentials',jsonb_build_object('service','transport','nicHmac','test-nic-hmac','vehiclePlateNormalized','ABC1234')
  );
BEGIN
  ASSERT job->>'accountId' = current_setting('test.traveler_id');
  ASSERT travelbuddy_api.complete_buddy_verification_job((job->>'jobId')::uuid, (job->>'leaseId')::uuid, dup_outcome)
    = '{"applied":true,"stale":false,"status":"manual_review"}';
  ASSERT travelbuddy_api.get_buddy_application_image((job->>'accountId')::uuid, 'selfie') IS NOT NULL;
END $$;

RESET ROLE;
DO $$ BEGIN
  ASSERT travelbuddy_private.set_account_admin('baecef71-e04c-4ddb-ab0d-b2eac433a606', true) = '["traveler","admin"]';
END $$;
SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  traveler_id uuid := current_setting('test.traveler_id')::uuid;
  detail jsonb := travelbuddy_api.admin_get_buddy_application(traveler_id);
BEGIN
  ASSERT detail->>'verificationBucket' = 'amber';
  ASSERT detail#>>'{runs,0,ruleOutcomes,0,code}' = 'NIC-05';
  ASSERT travelbuddy_api.admin_review_buddy_application(
    traveler_id, (detail->>'submittedAt')::timestamptz, 'rejected', 'Duplicate identity.'
  )->>'status' = 'rejected';
END $$;

SELECT set_config('request.jwt.claim.sub', '8f7120e8-b301-4c1e-ada6-203d19daea4f', true);
DO $$ BEGIN
  ASSERT travelbuddy_api.buddy_application_status()->>'status' = 'rejected';
  ASSERT travelbuddy_api.submit_buddy_application(
    current_setting('test.transport_app')::jsonb, current_setting('test.transport_images')::jsonb
  )->>'status' = 'pending';
END $$;

SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
DO $$
DECLARE
  traveler_id uuid := current_setting('test.traveler_id')::uuid;
  detail jsonb := travelbuddy_api.admin_get_buddy_application(traveler_id);
  today date := (now() AT TIME ZONE 'Asia/Colombo')::date;
  creds jsonb := jsonb_build_object(
    'vehiclePlateNormalized', 'WP CAB-5678',
    'dlExpiresAt', today + 100,
    'insuranceExpiresAt', today + 100,
    'erlExpiresAt', today + 100
  );
BEGIN
  ASSERT travelbuddy_api.admin_review_buddy_application(
    traveler_id, (detail->>'submittedAt')::timestamptz, 'approved', NULL, creds
  )->>'status' = 'approved';
  ASSERT travelbuddy_api.admin_get_buddy_application(traveler_id)#>>'{credentials,vehiclePlateNormalized}' = 'WPCAB5678';
END $$;

SELECT set_config('request.jwt.claim.sub', '8f7120e8-b301-4c1e-ada6-203d19daea4f', true);
DO $$ BEGIN
  ASSERT travelbuddy_api.account()->'roles' = '["traveler","guide"]';
  ASSERT travelbuddy_api.buddy_application_status()->>'transportEligible' = 'true';
  -- Reapply and manually re-approve without credentials: prior valid expiry dates & plate stay intact.
  ASSERT travelbuddy_api.submit_buddy_application(
    current_setting('test.transport_app')::jsonb, current_setting('test.transport_images')::jsonb
  )->>'status' = 'pending';
END $$;

SELECT set_config('request.jwt.claim.sub', '54d89ba5-0b67-42b5-bf4d-98c90093144a', true);
DO $$
DECLARE
  traveler_id uuid := current_setting('test.traveler_id')::uuid;
  detail jsonb := travelbuddy_api.admin_get_buddy_application(traveler_id);
  old_submission timestamptz := (detail->>'submittedAt')::timestamptz - interval '1 second';
BEGIN
  ASSERT travelbuddy_api.admin_buddy_application_image(traveler_id, 'selfie', old_submission) IS NULL;
  ASSERT travelbuddy_api.admin_buddy_application_image(traveler_id, 'selfie', (detail->>'submittedAt')::timestamptz) IS NOT NULL;
  BEGIN
    PERFORM travelbuddy_api.admin_requeue_buddy_verification(traveler_id, old_submission);
    ASSERT false, 'stale requeue accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  ASSERT travelbuddy_api.admin_review_buddy_application(
    traveler_id, (detail->>'submittedAt')::timestamptz, 'approved'
  )->>'status' = 'approved';
  detail := travelbuddy_api.admin_get_buddy_application(traveler_id);
  ASSERT detail#>>'{credentials,vehiclePlateNormalized}' = 'WPCAB5678';
  ASSERT (detail#>>'{credentials,transportEligible}')::boolean = true;
END $$;

-- Verify retention sweep transitions aged manual_review applications out of review,
-- scrubs PII, purges photos, and allows the applicant to reapply.
SELECT set_config('request.jwt.claim.sub', '8f7120e8-b301-4c1e-ada6-203d19daea4f', true);
DO $$ BEGIN
  ASSERT travelbuddy_api.submit_buddy_application(
    current_setting('test.transport_app')::jsonb, current_setting('test.transport_images')::jsonb
  )->>'status' = 'pending';
END $$;
RESET ROLE;
DO $$
DECLARE traveler_id uuid := current_setting('test.traveler_id')::uuid;
BEGIN
  UPDATE travelbuddy_private.buddy_applications
  SET status = 'manual_review', submitted_at = now() - interval '15 days'
  WHERE account_id = traveler_id;
  UPDATE travelbuddy_private.buddy_verification_jobs
  SET submitted_at = now() - interval '15 days'
  WHERE account_id = traveler_id AND status = 'queued';
  -- Seed non-consecutive spoof runs newer than earlier runs (spoof, passed, spoof).
  INSERT INTO travelbuddy_private.buddy_verification_runs (
    account_id, submitted_at, provider_mode, shadow_mode, pipeline_version, decision_bucket,
    liveness_status, extracted_summary, rule_outcomes, latency_ms, created_at
  ) VALUES
  (traveler_id, now() - interval '3 hours', 'option_a_inhouse', false, '1', 'red', 'spoof', '{}'::jsonb, '[]'::jsonb, 1, clock_timestamp() + interval '1 second'),
  (traveler_id, now() - interval '2 hours', 'option_a_inhouse', false, '1', 'green', 'passed', '{}'::jsonb, '[]'::jsonb, 1, clock_timestamp() + interval '2 seconds'),
  (traveler_id, now() - interval '1 hour', 'option_a_inhouse', false, '1', 'red', 'spoof', '{}'::jsonb, '[]'::jsonb, 1, clock_timestamp() + interval '3 seconds');
END $$;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  ASSERT travelbuddy_api.sweep_buddy_verification_maintenance()->>'purgedApplications' = '1';
END $$;
SELECT set_config('request.jwt.claim.sub', '8f7120e8-b301-4c1e-ada6-203d19daea4f', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT travelbuddy_api.buddy_application_status()->>'status' = 'changes_requested';
  ASSERT travelbuddy_api.buddy_application_status()->>'canReapply' = 'true';
  ASSERT travelbuddy_api.submit_buddy_application(
    current_setting('test.transport_app')::jsonb, current_setting('test.transport_images')::jsonb
  )->>'status' = 'pending';
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE job jsonb := travelbuddy_api.claim_buddy_verification_job();
BEGIN
  ASSERT job->>'accountId' = current_setting('test.traveler_id');
  ASSERT (job->>'consecutiveSpoofFailures')::int = 1;
END $$;
ROLLBACK;
