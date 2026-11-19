BEGIN;
DO $$ BEGIN
  IF current_database() <> 'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF;
END $$;

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
END $$;
ROLLBACK;
