ALTER TABLE travelbuddy_private.buddy_applications
  DROP CONSTRAINT buddy_applications_status_check,
  ADD CONSTRAINT buddy_applications_status_check
    CHECK (status IN ('pending', 'manual_review', 'approved', 'changes_requested', 'rejected')),
  ADD COLUMN decision_source text CHECK (decision_source IN ('automated', 'manual')),
  ADD COLUMN verification_bucket text CHECK (verification_bucket IN ('green', 'amber', 'red')),
  ADD COLUMN appeal_requested_at timestamptz;

-- Existing pending applications may use the earlier transport image slots.
UPDATE travelbuddy_private.buddy_applications SET status = 'manual_review' WHERE status = 'pending';
UPDATE travelbuddy_private.buddy_applications SET decision_source = 'manual' WHERE reviewed_at IS NOT NULL;

CREATE TABLE travelbuddy_private.buddy_verification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES travelbuddy_private.buddy_applications(account_id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text CHECK (length(last_error) <= 500),
  UNIQUE (account_id, submitted_at),
  CHECK ((status = 'running') = (lease_id IS NOT NULL AND lease_expires_at IS NOT NULL))
);

CREATE INDEX buddy_verification_jobs_ready ON travelbuddy_private.buddy_verification_jobs (available_at, id)
  WHERE status = 'queued';
CREATE INDEX buddy_verification_jobs_lease ON travelbuddy_private.buddy_verification_jobs (lease_expires_at)
  WHERE status = 'running';

CREATE TABLE travelbuddy_private.buddy_verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES travelbuddy_private.buddy_applications(account_id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL,
  provider_mode text NOT NULL,
  shadow_mode boolean NOT NULL,
  pipeline_version text NOT NULL,
  decision_bucket text NOT NULL CHECK (decision_bucket IN ('green', 'amber', 'red')),
  liveness_status text,
  nic_face_score numeric,
  dl_face_score numeric,
  pdf417_passed boolean,
  rule_outcomes jsonb NOT NULL CHECK (jsonb_typeof(rule_outcomes) = 'array'),
  extracted_summary jsonb NOT NULL CHECK (jsonb_typeof(extracted_summary) = 'object'),
  applicant_feedback text,
  latency_ms int NOT NULL CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX buddy_verification_runs_recent ON travelbuddy_private.buddy_verification_runs (account_id, created_at DESC, id);
CREATE INDEX buddy_verification_runs_submission
  ON travelbuddy_private.buddy_verification_runs (account_id, submitted_at, created_at DESC, id);

CREATE TABLE travelbuddy_private.buddy_credentials (
  account_id uuid PRIMARY KEY REFERENCES travelbuddy_private.buddy_applications(account_id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('local', 'guide', 'transport')),
  nic_hmac text,
  dl_hmac text,
  vehicle_plate_normalized text,
  vehicle_class text,
  dl_expires_at date,
  insurance_expires_at date,
  erl_expires_at date,
  sltda_expires_at date,
  transport_eligible boolean NOT NULL DEFAULT false,
  verification_method text NOT NULL CHECK (verification_method IN ('auto', 'manual')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_expiry_notice_at date,
  last_expiry_notice_stage jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX buddy_credentials_nic ON travelbuddy_private.buddy_credentials (nic_hmac) WHERE nic_hmac IS NOT NULL;
CREATE INDEX buddy_credentials_plate ON travelbuddy_private.buddy_credentials (vehicle_plate_normalized)
  WHERE vehicle_plate_normalized IS NOT NULL;

ALTER TABLE travelbuddy_private.buddy_verification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE travelbuddy_private.buddy_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE travelbuddy_private.buddy_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON travelbuddy_private.buddy_verification_jobs, travelbuddy_private.buddy_verification_runs,
  travelbuddy_private.buddy_credentials FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION travelbuddy_private.buddy_expiring_docs(
  credentials travelbuddy_private.buddy_credentials, local_today date
) RETURNS TABLE(kind text, expires_at date, days_remaining int, stage text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT d.kind, d.expires_at, d.expires_at - local_today,
    CASE WHEN d.expires_at <= local_today THEN 'expired'
         WHEN d.expires_at <= local_today + 7 THEN '7d' ELSE '30d' END
  FROM (VALUES
    ('driving_licence', credentials.dl_expires_at),
    ('insurance', credentials.insurance_expires_at),
    ('revenue_licence', credentials.erl_expires_at),
    ('sltda', credentials.sltda_expires_at)
  ) AS d(kind, expires_at)
  WHERE d.expires_at <= local_today + 30
$$;

CREATE OR REPLACE FUNCTION travelbuddy_private.buddy_application_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'status', b.status, 'submittedAt', b.submitted_at, 'message', b.review_message,
    'decisionSource', b.decision_source, 'verificationBucket', b.verification_bucket,
    'canAppeal', coalesce(b.status = 'changes_requested' AND b.decision_source = 'automated'
      AND b.appeal_requested_at IS NULL AND EXISTS (
        SELECT 1 FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = b.account_id
      ), false),
    'canReapply', b.status IN ('changes_requested', 'rejected', 'approved'),
    'appealRequestedAt', b.appeal_requested_at,
    'service', coalesce(b.details->>'service', c.service), 'transportEligible', c.transport_eligible,
    'expiringDocs', coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', d.kind, 'expiresAt', d.expires_at,
        'daysRemaining', d.days_remaining, 'stage', d.stage) ORDER BY d.expires_at, d.kind)
      FROM travelbuddy_private.buddy_expiring_docs(c, (now() AT TIME ZONE 'Asia/Colombo')::date) d
    ), '[]'::jsonb)
  )
  FROM travelbuddy_private.buddy_applications b
  JOIN travelbuddy_backend.accounts a ON a.id = b.account_id
  LEFT JOIN travelbuddy_private.buddy_credentials c ON c.account_id = b.account_id
  WHERE a.supabase_user_id = auth.uid() AND a.schema_version = 1 AND a.data->>'status' = 'active'
$$;

CREATE OR REPLACE FUNCTION travelbuddy_private.submit_buddy_application(application jsonb, images jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  applicant uuid;
  existing_status text;
  submission_time timestamptz;
  service text := application->>'service';
  document_type text := application->>'documentType';
  birth_date date;
  phone text := regexp_replace(application->>'phone', '[[:space:]-]', '', 'g');
  nic_number text := upper(regexp_replace(application->>'nicNumber', '[[:space:]-]', '', 'g'));
  required_kinds text[] := ARRAY['id-front', 'selfie'];
  allowed_kinds text[];
  item text;
  encoded text;
  content_type text;
  image_bytes bytea;
BEGIN
  PERFORM travelbuddy_private.account();
  -- Lock the account before changing its application or jobs.
  SELECT a.id INTO applicant FROM travelbuddy_backend.accounts a
  WHERE a.supabase_user_id = actor AND a.schema_version = 1 AND a.data->>'status' = 'active'
    AND a.data->>'onboarding' IN ('pending', 'completed') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account cannot submit a buddy application.' USING ERRCODE = '42501';
  END IF;

  SELECT b.status INTO existing_status FROM travelbuddy_private.buddy_applications b WHERE b.account_id = applicant FOR UPDATE;
  IF existing_status IN ('pending', 'manual_review') THEN
    RETURN travelbuddy_private.buddy_application_status();
  END IF;

  BEGIN
    birth_date := (application->>'birthDate')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Enter a valid birth date.' USING ERRCODE = '22023';
  END;

  IF coalesce(service, '') NOT IN ('local', 'guide', 'transport')
    OR coalesce(document_type, '') NOT IN ('nic', 'passport')
    OR birth_date IS NULL OR birth_date < DATE '1900-01-01'
    OR birth_date > ((now() AT TIME ZONE 'Asia/Colombo')::date - interval '18 years')::date
    OR coalesce(phone, '') !~ '^(\+94|0)7[0-9]{8}$'
    OR length(trim(coalesce(application->>'legalName', ''))) NOT BETWEEN 1 AND 120
    OR length(trim(coalesce(application->>'displayName', ''))) NOT BETWEEN 1 AND 120
    OR length(trim(coalesce(application->>'homeBase', ''))) NOT BETWEEN 1 AND 120
    OR length(trim(coalesce(application->>'languages', ''))) NOT BETWEEN 1 AND 200
    OR length(coalesce(application->>'intro', '')) > 2000
    OR (application ? 'faceComparisonConsent' AND jsonb_typeof(application->'faceComparisonConsent') <> 'boolean')
    OR coalesce(jsonb_typeof(application->'nicNumber'), 'null') NOT IN ('null', 'string')
    OR (document_type = 'nic' AND nic_number <> '' AND nic_number !~ '^([0-9]{9}[VX]|[0-9]{12})$')
    OR coalesce(jsonb_typeof(application->'livenessSessionId'), 'null') NOT IN ('null', 'string')
    OR length(application->>'livenessSessionId') > 128
    OR coalesce(jsonb_typeof(application->'thirdPartyVehicle'), 'null') NOT IN ('null', 'boolean')
  THEN
    RAISE EXCEPTION 'Enter valid application details. Buddies must be at least 18.' USING ERRCODE = '22023';
  END IF;

  IF document_type = 'nic' THEN required_kinds := required_kinds || ARRAY['id-back']; END IF;
  IF service = 'guide' THEN
    IF length(trim(coalesce(application->>'guideLicence', ''))) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Enter your SLTDA licence number.' USING ERRCODE = '22023';
    END IF;
    required_kinds := required_kinds || ARRAY['guide-licence'];
  ELSIF service = 'transport' THEN
    required_kinds := required_kinds || ARRAY[
      'driving-licence-front', 'driving-licence-back', 'vehicle', 'insurance', 'revenue-licence'
    ];
  END IF;
  allowed_kinds := required_kinds;
  IF service = 'transport' THEN allowed_kinds := allowed_kinds || ARRAY['owner-authorization']; END IF;

  IF jsonb_typeof(images) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Attach the required application images.' USING ERRCODE = '22023';
  END IF;
  IF NOT (images ?& required_kinds) OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(images) AS k(kind) WHERE NOT (k.kind = ANY(allowed_kinds))
  ) THEN
    RAISE EXCEPTION 'Attach only the required and supported application images.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO travelbuddy_private.buddy_applications AS b (account_id, status, details)
  VALUES (applicant, 'pending', jsonb_build_object(
    'displayName', trim(application->>'displayName'), 'legalName', trim(application->>'legalName'),
    'birthDate', birth_date, 'phone', '+94' || right(phone, 9),
    'documentType', document_type, 'service', service,
    'homeBase', trim(application->>'homeBase'), 'languages', trim(application->>'languages'),
    'intro', trim(coalesce(application->>'intro', '')),
    'faceComparisonConsent', coalesce(application->'faceComparisonConsent' = 'true'::jsonb, false),
    'guideLicence', CASE WHEN service = 'guide' THEN trim(application->>'guideLicence') END,
    'nicNumber', CASE WHEN document_type = 'nic' THEN nullif(nic_number, '') END,
    'livenessSessionId', nullif(application->>'livenessSessionId', ''),
    'thirdPartyVehicle', service = 'transport' AND coalesce(application->'thirdPartyVehicle' = 'true'::jsonb, false)
  ))
  ON CONFLICT (account_id) DO UPDATE SET
    status = 'pending', details = excluded.details,
    submitted_at = greatest(excluded.submitted_at, b.submitted_at + interval '1 microsecond'),
    reviewed_at = NULL, reviewed_by = NULL, review_message = NULL,
    decision_source = NULL, verification_bucket = NULL, appeal_requested_at = NULL
  RETURNING b.submitted_at INTO submission_time;

  DELETE FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = applicant;
  FOR item IN SELECT jsonb_object_keys(images) LOOP
    encoded := images->item->>'base64';
    content_type := images->item->>'type';
    IF encoded IS NULL OR length(encoded) > 2796204 THEN
      RAISE EXCEPTION 'Each application image must be 2 MB or smaller.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      image_bytes := decode(encoded, 'base64');
    EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation THEN
      RAISE EXCEPTION 'Choose valid JPG, PNG or WebP images.' USING ERRCODE = '22023';
    END;
    IF octet_length(image_bytes) NOT BETWEEN 12 AND 2097152 OR NOT coalesce(
      CASE content_type
        WHEN 'image/jpeg' THEN substr(image_bytes, 1, 3) = decode('ffd8ff', 'hex')
        WHEN 'image/png' THEN substr(image_bytes, 1, 8) = decode('89504e470d0a1a0a', 'hex')
        WHEN 'image/webp' THEN substr(image_bytes, 1, 4) = convert_to('RIFF', 'UTF8')
          AND substr(image_bytes, 9, 4) = convert_to('WEBP', 'UTF8')
        ELSE false
      END, false
    ) THEN
      RAISE EXCEPTION 'Choose valid JPG, PNG or WebP images.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO travelbuddy_private.buddy_application_images (account_id, kind, mime_type, content)
    VALUES (applicant, item, content_type, image_bytes);
  END LOOP;

  INSERT INTO travelbuddy_private.buddy_verification_jobs (account_id, submitted_at)
  VALUES (applicant, submission_time);

  RETURN travelbuddy_private.buddy_application_status();
END $$;

-- The existing onboarding definer uses the restricted API executor role.
GRANT SELECT (account_id, status) ON travelbuddy_private.buddy_applications TO travelbuddy_api_executor;
CREATE POLICY buddy_application_onboarding_status ON travelbuddy_private.buddy_applications
  FOR SELECT TO travelbuddy_api_executor USING (true);

CREATE OR REPLACE FUNCTION travelbuddy_private.onboard(display_name text, account_type text, expected_revision int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb := travelbuddy_private.account();
BEGIN
  PERFORM 1 FROM travelbuddy_backend.accounts WHERE id = (a->>'id')::uuid
    AND revision = expected_revision AND data->>'onboarding' = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration is complete or your account changed. Reload.' USING ERRCODE = '40001';
  END IF;
  IF display_name IS NULL OR length(trim(display_name)) NOT BETWEEN 1 AND 120
    OR account_type IS DISTINCT FROM 'traveler' THEN
    RAISE EXCEPTION 'Enter a name and choose Traveller, or submit a buddy application.';
  END IF;
  IF EXISTS (SELECT 1 FROM travelbuddy_private.buddy_applications
      WHERE account_id = (a->>'id')::uuid AND status IN ('pending', 'manual_review')) THEN
    RAISE EXCEPTION 'Your buddy application is under review.' USING ERRCODE = '42501';
  END IF;
  UPDATE travelbuddy_backend.accounts
    SET data = data || jsonb_build_object(
          'displayName', trim(display_name), 'onboarding', 'completed',
          'roles', CASE WHEN data->'roles' ? 'admin' THEN '["traveler","admin"]'::jsonb ELSE '["traveler"]'::jsonb END
        ), revision = revision + 1, updated_at = now()
    WHERE id = (a->>'id')::uuid;
  RETURN travelbuddy_private.account();
END $$;

CREATE FUNCTION travelbuddy_private.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM travelbuddy_backend.accounts a
    WHERE a.supabase_user_id = auth.uid() AND a.schema_version = 1
      AND a.data->>'status' = 'active' AND jsonb_typeof(a.data->'roles') = 'array'
      AND a.data->'roles' ? 'admin'
  )
$$;

CREATE FUNCTION travelbuddy_private.set_account_admin(account_id uuid, grant_admin boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE roles jsonb;
BEGIN
  IF grant_admin IS NULL THEN
    RAISE EXCEPTION 'Specify whether to grant or revoke admin.' USING ERRCODE = '22023';
  END IF;
  UPDATE travelbuddy_backend.accounts a SET
    data = jsonb_set(a.data, '{roles}', CASE
      WHEN grant_admin AND NOT (a.data->'roles' ? 'admin') THEN (a.data->'roles') || '["admin"]'::jsonb
      WHEN grant_admin THEN a.data->'roles'
      WHEN (a.data->'roles') - 'admin' = '[]'::jsonb THEN '["traveler"]'::jsonb
      ELSE (a.data->'roles') - 'admin'
    END),
    revision = a.revision + 1, updated_at = now()
  WHERE a.id = account_id AND a.schema_version = 1 AND jsonb_typeof(a.data->'roles') = 'array'
  RETURNING a.data->'roles' INTO roles;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN roles;
END $$;

CREATE FUNCTION travelbuddy_private.decide_buddy_application(
  applicant uuid, submission timestamptz, decision text, reviewer text, message text,
  credentials jsonb, source text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  application travelbuddy_private.buddy_applications;
  service_type text;
  reviewed_time timestamptz := clock_timestamp();
  reason text := nullif(trim(message), '');
  dl_expiry date;
  insurance_expiry date;
  erl_expiry date;
  sltda_expiry date;
  local_today date := (now() AT TIME ZONE 'Asia/Colombo')::date;
BEGIN
  IF decision IS NULL OR decision NOT IN ('approved', 'changes_requested', 'rejected')
    OR source IS NULL OR source NOT IN ('automated', 'manual')
    OR length(trim(coalesce(reviewer, ''))) NOT BETWEEN 1 AND 120
    OR length(coalesce(message, '')) > 1000
    OR (decision <> 'approved' AND reason IS NULL) THEN
    RAISE EXCEPTION 'Choose a valid decision and give a reason when declining approval.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    dl_expiry := nullif(trim(credentials->>'dlExpiresAt'), '')::date;
    insurance_expiry := nullif(trim(credentials->>'insuranceExpiresAt'), '')::date;
    erl_expiry := nullif(trim(credentials->>'erlExpiresAt'), '')::date;
    sltda_expiry := nullif(trim(credentials->>'sltdaExpiresAt'), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Enter valid credential expiry dates.' USING ERRCODE = '22023';
  END;

  PERFORM 1 FROM travelbuddy_backend.accounts a
  WHERE a.id = applicant AND a.schema_version = 1 AND a.data->>'status' = 'active'
    AND a.data->>'onboarding' IN ('pending', 'completed') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The applicant account is unavailable.' USING ERRCODE = '40001';
  END IF;

  SELECT b.* INTO application FROM travelbuddy_private.buddy_applications b
  WHERE b.account_id = applicant AND b.submitted_at = submission
    AND (b.status IN ('pending', 'manual_review')
      OR (source = 'manual' AND b.status = 'changes_requested' AND b.decision_source = 'automated'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The application changed. Reload before reviewing.' USING ERRCODE = '40001';
  END IF;

  service_type := application.details->>'service';
  IF decision = 'approved' THEN
    IF NOT EXISTS (SELECT 1 FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = applicant) THEN
      RAISE EXCEPTION 'Application images are no longer available.' USING ERRCODE = '40001';
    END IF;
    IF credentials->>'service' IS NOT NULL AND credentials->>'service' <> service_type THEN
      RAISE EXCEPTION 'Verification credentials do not match the application service.' USING ERRCODE = '22023';
    END IF;

    UPDATE travelbuddy_backend.accounts a SET
      data = a.data || jsonb_build_object(
        'displayName', application.details->>'displayName',
        'roles', CASE WHEN a.data->'roles' ? 'admin' THEN '["guide","admin"]'::jsonb ELSE '["guide"]'::jsonb END,
        'onboarding', 'completed',
        'profileDetails', coalesce(a.data->'profileDetails', '{}'::jsonb) || jsonb_build_object(
          'homeBase', application.details->>'homeBase', 'languages', application.details->>'languages',
          'bio', application.details->>'intro'
        )
      ), revision = a.revision + 1, updated_at = now()
    WHERE a.id = applicant AND a.data->>'onboarding' = 'pending';

    UPDATE travelbuddy_backend.accounts a SET
      data = a.data || jsonb_build_object(
        'roles', ((a.data->'roles') - 'guide') || '["guide"]'::jsonb,
        'profileDetails', coalesce(a.data->'profileDetails', '{}'::jsonb) || jsonb_build_object(
          'homeBase', coalesce(nullif(trim(a.data->'profileDetails'->>'homeBase'), ''), application.details->>'homeBase'),
          'languages', coalesce(nullif(trim(a.data->'profileDetails'->>'languages'), ''), application.details->>'languages'),
          'bio', coalesce(nullif(trim(a.data->'profileDetails'->>'bio'), ''), application.details->>'intro')
        )
      ), revision = a.revision + 1, updated_at = now()
    WHERE a.id = applicant AND a.data->>'onboarding' = 'completed'
      AND NOT (a.data->'roles' ?| ARRAY['provider', 'guide']);

    INSERT INTO travelbuddy_private.buddy_credentials AS c (
      account_id, service, nic_hmac, dl_hmac, vehicle_plate_normalized, vehicle_class,
      dl_expires_at, insurance_expires_at, erl_expires_at, sltda_expires_at,
      transport_eligible, verification_method, verified_at
    ) VALUES (
      applicant, service_type, credentials->>'nicHmac', credentials->>'dlHmac',
      upper(regexp_replace(nullif(trim(credentials->>'vehiclePlateNormalized'), ''), '[[:space:]-]+', '', 'g')),
      nullif(trim(credentials->>'vehicleClass'), ''),
      dl_expiry, insurance_expiry, erl_expiry, sltda_expiry,
      (service_type = 'transport' AND (
        CASE WHEN source = 'manual'
          THEN coalesce(dl_expiry > local_today, true)
            AND coalesce(insurance_expiry > local_today, true)
            AND coalesce(erl_expiry > local_today, true)
          ELSE coalesce(dl_expiry > local_today
            AND insurance_expiry > local_today
            AND erl_expiry > local_today, false)
        END
      )),
      CASE WHEN source = 'automated' THEN 'auto' ELSE 'manual' END, reviewed_time
    )
    ON CONFLICT (account_id) DO UPDATE SET
      service = excluded.service,
      nic_hmac = coalesce(excluded.nic_hmac, c.nic_hmac),
      dl_hmac = coalesce(excluded.dl_hmac,
        CASE WHEN source = 'manual' AND c.service = excluded.service THEN c.dl_hmac END),
      vehicle_plate_normalized = coalesce(excluded.vehicle_plate_normalized,
        CASE WHEN source = 'manual' AND c.service = excluded.service THEN c.vehicle_plate_normalized END),
      vehicle_class = coalesce(excluded.vehicle_class,
        CASE WHEN source = 'manual' AND c.service = excluded.service THEN c.vehicle_class END),
      dl_expires_at = coalesce(excluded.dl_expires_at,
        CASE WHEN source = 'manual' AND c.service = excluded.service AND c.dl_expires_at > local_today THEN c.dl_expires_at END),
      insurance_expires_at = coalesce(excluded.insurance_expires_at,
        CASE WHEN source = 'manual' AND c.service = excluded.service AND c.insurance_expires_at > local_today THEN c.insurance_expires_at END),
      erl_expires_at = coalesce(excluded.erl_expires_at,
        CASE WHEN source = 'manual' AND c.service = excluded.service AND c.erl_expires_at > local_today THEN c.erl_expires_at END),
      sltda_expires_at = coalesce(excluded.sltda_expires_at,
        CASE WHEN source = 'manual' AND c.service = excluded.service AND c.sltda_expires_at > local_today THEN c.sltda_expires_at END),
      transport_eligible = (excluded.service = 'transport' AND (
        CASE WHEN source = 'manual'
          THEN coalesce(coalesce(excluded.dl_expires_at, CASE WHEN c.service = excluded.service AND c.dl_expires_at > local_today THEN c.dl_expires_at END) > local_today, true)
            AND coalesce(coalesce(excluded.insurance_expires_at, CASE WHEN c.service = excluded.service AND c.insurance_expires_at > local_today THEN c.insurance_expires_at END) > local_today, true)
            AND coalesce(coalesce(excluded.erl_expires_at, CASE WHEN c.service = excluded.service AND c.erl_expires_at > local_today THEN c.erl_expires_at END) > local_today, true)
          ELSE coalesce(excluded.dl_expires_at > local_today
            AND excluded.insurance_expires_at > local_today
            AND excluded.erl_expires_at > local_today, false)
        END
      )),
      verification_method = excluded.verification_method,
      verified_at = excluded.verified_at,
      last_expiry_notice_at = NULL,
      last_expiry_notice_stage = '{}'::jsonb;
  END IF;

  IF source = 'manual' OR decision <> 'changes_requested' THEN
    DELETE FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = applicant;
    application.details := jsonb_build_object('service', service_type);
  END IF;

  UPDATE travelbuddy_private.buddy_applications b SET
    status = decision, details = application.details,
    reviewed_at = reviewed_time, reviewed_by = trim(reviewer), review_message = reason,
    decision_source = source,
    verification_bucket = CASE WHEN source = 'automated' THEN
      CASE WHEN decision = 'approved' THEN 'green' ELSE 'red' END ELSE b.verification_bucket END
  WHERE b.account_id = applicant;

  -- A queued job no longer needs work after a manual decision. An in-flight
  -- job can still acknowledge its lease, but it cannot overwrite the decision.
  IF source = 'manual' THEN
    UPDATE travelbuddy_private.buddy_verification_jobs j
    SET status = 'completed', completed_at = reviewed_time, updated_at = reviewed_time
    WHERE j.account_id = applicant AND j.submitted_at = submission AND j.status = 'queued';
  END IF;

  RETURN jsonb_build_object('accountId', applicant, 'status', decision, 'reviewedAt', reviewed_time,
    'reviewedBy', trim(reviewer), 'reviewMessage', reason);
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.review_buddy_application(
  applicant uuid, submission timestamptz, approved boolean, reviewer text, message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM travelbuddy_private.decide_buddy_application(applicant, submission,
    CASE approved WHEN true THEN 'approved' WHEN false THEN 'changes_requested' END,
    reviewer, message, NULL, 'manual');
END $$;

CREATE FUNCTION travelbuddy_private.request_buddy_manual_review() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE applicant uuid;
BEGIN
  SELECT a.id INTO applicant FROM travelbuddy_backend.accounts a
  WHERE a.supabase_user_id = auth.uid() AND a.schema_version = 1 AND a.data->>'status' = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sign in to request a review.' USING ERRCODE = '42501';
  END IF;

  -- Serialize with retention cleanup before checking that evidence is still present.
  PERFORM 1 FROM travelbuddy_private.buddy_applications b WHERE b.account_id = applicant FOR UPDATE;
  UPDATE travelbuddy_private.buddy_applications b
  SET status = 'manual_review', appeal_requested_at = clock_timestamp(), review_message = NULL
  WHERE b.account_id = applicant AND b.status = 'changes_requested' AND b.decision_source = 'automated'
    AND b.appeal_requested_at IS NULL
    AND EXISTS (SELECT 1 FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = b.account_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This application cannot be appealed.' USING ERRCODE = '22023';
  END IF;
  RETURN travelbuddy_private.buddy_application_status();
END $$;

CREATE FUNCTION travelbuddy_private.buddy_verification_run_details(r travelbuddy_private.buddy_verification_runs) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'decisionBucket', r.decision_bucket, 'shadowMode', r.shadow_mode,
    'pipelineVersion', r.pipeline_version, 'livenessStatus', r.liveness_status,
    'nicFaceScore', r.nic_face_score, 'dlFaceScore', r.dl_face_score, 'pdf417Passed', r.pdf417_passed,
    'latencyMs', r.latency_ms, 'createdAt', r.created_at
  )
$$;

-- This invoker helper is reachable only through the two admin-checked functions.
CREATE FUNCTION travelbuddy_private.buddy_application_queue_fields(
  b travelbuddy_private.buddy_applications
) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'accountId', b.account_id, 'displayName', a.data->>'displayName', 'email', u.email,
    'roles', a.data->'roles', 'onboarding', a.data->>'onboarding',
    'status', b.status, 'service', b.details->>'service', 'documentType', b.details->>'documentType',
    'submittedAt', b.submitted_at, 'reviewedAt', b.reviewed_at, 'reviewedBy', b.reviewed_by,
    'reviewMessage', b.review_message, 'decisionSource', b.decision_source,
    'verificationBucket', b.verification_bucket, 'appealRequestedAt', b.appeal_requested_at,
    'hasImages', jsonb_array_length(images.kinds) > 0, 'imageKinds', images.kinds,
    'jobStatus', j.status, 'latestRun', (
      SELECT travelbuddy_private.buddy_verification_run_details(r) || jsonb_build_object(
        'redCount', counts.red_count, 'amberCount', counts.amber_count, 'passCount', counts.pass_count
      )
      FROM travelbuddy_private.buddy_verification_runs r
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE (o.value->>'status') = 'red') AS red_count,
          count(*) FILTER (WHERE (o.value->>'status') = 'amber') AS amber_count,
          count(*) FILTER (WHERE (o.value->>'status') = 'pass') AS pass_count
        FROM jsonb_array_elements(r.rule_outcomes) o
      ) counts
      WHERE r.account_id = b.account_id AND r.submitted_at = b.submitted_at
      ORDER BY r.created_at DESC, r.id LIMIT 1
    )
  ) INTO result
  FROM travelbuddy_backend.accounts a
  LEFT JOIN auth.users u ON u.id = a.supabase_user_id
  LEFT JOIN travelbuddy_private.buddy_verification_jobs j
    ON j.account_id = b.account_id AND j.submitted_at = b.submitted_at
  CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(i.kind ORDER BY i.kind), '[]'::jsonb) AS kinds
    FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = b.account_id
  ) images
  WHERE a.id = b.account_id;
  RETURN result;
END $$;

CREATE FUNCTION travelbuddy_private.admin_list_buddy_applications(status_filter text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT travelbuddy_private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF status_filter NOT IN ('all', 'needs_review', 'pending', 'manual_review', 'changes_requested', 'rejected', 'approved') THEN
    RAISE EXCEPTION 'Invalid application status filter.' USING ERRCODE = '22023';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(travelbuddy_private.buddy_application_queue_fields(b)
      ORDER BY b.appeal_requested_at DESC NULLS LAST,
        CASE b.status WHEN 'manual_review' THEN 0 WHEN 'pending' THEN 1
          WHEN 'changes_requested' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
        b.submitted_at, b.account_id), '[]'::jsonb)
    FROM travelbuddy_private.buddy_applications b
    WHERE status_filter IS NULL OR status_filter = 'all' OR status_filter = b.status
      OR (status_filter = 'needs_review' AND b.status IN ('pending', 'manual_review', 'changes_requested'))
  );
END $$;

CREATE FUNCTION travelbuddy_private.admin_get_buddy_application(applicant_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE b travelbuddy_private.buddy_applications;
BEGIN
  IF NOT travelbuddy_private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO b FROM travelbuddy_private.buddy_applications a WHERE a.account_id = applicant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Buddy application not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN travelbuddy_private.buddy_application_queue_fields(b) || jsonb_build_object(
    'details', b.details,
    'runs', coalesce((
      SELECT jsonb_agg(travelbuddy_private.buddy_verification_run_details(r) || jsonb_build_object(
        'providerMode', r.provider_mode, 'ruleOutcomes', r.rule_outcomes,
        'extractedSummary', r.extracted_summary, 'applicantFeedback', r.applicant_feedback
      ) ORDER BY r.created_at DESC, r.id)
      FROM (
        SELECT v.* FROM travelbuddy_private.buddy_verification_runs v
        WHERE v.account_id = applicant_id ORDER BY v.created_at DESC, v.id LIMIT 10
      ) r
    ), '[]'::jsonb),
    'credentials', (
      SELECT jsonb_build_object(
        'service', c.service, 'vehiclePlateNormalized', c.vehicle_plate_normalized, 'vehicleClass', c.vehicle_class,
        'dlExpiresAt', c.dl_expires_at, 'insuranceExpiresAt', c.insurance_expires_at,
        'erlExpiresAt', c.erl_expires_at, 'sltdaExpiresAt', c.sltda_expires_at,
        'transportEligible', c.transport_eligible, 'verificationMethod', c.verification_method, 'verifiedAt', c.verified_at
      ) FROM travelbuddy_private.buddy_credentials c WHERE c.account_id = applicant_id
    )
  );
END $$;

CREATE FUNCTION travelbuddy_private.get_buddy_application_image(
  p_account_id uuid, p_kind text, p_submission timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('mimeType', i.mime_type, 'base64', replace(encode(i.content, 'base64'), E'\n', ''))
  FROM travelbuddy_private.buddy_application_images i
  JOIN travelbuddy_private.buddy_applications b ON b.account_id = i.account_id
  WHERE i.account_id = p_account_id AND i.kind = p_kind
    AND (p_submission IS NULL OR b.submitted_at = p_submission)
$$;

CREATE FUNCTION travelbuddy_private.admin_buddy_application_image(
  applicant_id uuid, image_kind text, submission timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT travelbuddy_private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = '42501';
  END IF;
  RETURN travelbuddy_private.get_buddy_application_image(applicant_id, image_kind, submission);
END $$;

CREATE FUNCTION travelbuddy_private.admin_review_buddy_application(
  applicant_id uuid, submission timestamptz, decision text, message text DEFAULT NULL, credentials jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  reviewer text;
  safe_credentials jsonb := NULL;
BEGIN
  IF NOT travelbuddy_private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = '42501';
  END IF;
  IF credentials IS NOT NULL THEN
    IF jsonb_typeof(credentials) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid verification credentials.' USING ERRCODE = '22023';
    END IF;
    safe_credentials := jsonb_strip_nulls(jsonb_build_object(
      'vehiclePlateNormalized', credentials->>'vehiclePlateNormalized',
      'vehicleClass', credentials->>'vehicleClass',
      'dlExpiresAt', credentials->>'dlExpiresAt',
      'insuranceExpiresAt', credentials->>'insuranceExpiresAt',
      'erlExpiresAt', credentials->>'erlExpiresAt',
      'sltdaExpiresAt', credentials->>'sltdaExpiresAt'
    ));
  END IF;
  SELECT 'admin:' || a.id INTO reviewer FROM travelbuddy_backend.accounts a WHERE a.supabase_user_id = auth.uid();
  RETURN travelbuddy_private.decide_buddy_application(
    applicant_id, submission, decision, reviewer, message, safe_credentials, 'manual'
  );
END $$;

CREATE FUNCTION travelbuddy_private.admin_requeue_buddy_verification(
  applicant_id uuid, submission timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  submission_time timestamptz;
  job_id uuid;
BEGIN
  IF NOT travelbuddy_private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM travelbuddy_backend.accounts a
    WHERE a.id = applicant_id AND a.schema_version = 1 AND a.data->>'status' = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The applicant account is unavailable.' USING ERRCODE = '40001';
  END IF;
  SELECT b.submitted_at INTO submission_time FROM travelbuddy_private.buddy_applications b
    WHERE b.account_id = applicant_id FOR UPDATE;
  IF NOT FOUND OR (submission IS NOT NULL AND submission_time IS DISTINCT FROM submission) THEN
    RAISE EXCEPTION 'The application changed. Reload before requeuing.' USING ERRCODE = '40001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = applicant_id
  ) THEN
    RAISE EXCEPTION 'Application images are no longer available.' USING ERRCODE = '22023';
  END IF;

  UPDATE travelbuddy_private.buddy_applications b SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL,
    review_message = NULL, verification_bucket = NULL, decision_source = NULL WHERE b.account_id = applicant_id;

  INSERT INTO travelbuddy_private.buddy_verification_jobs AS j (account_id, submitted_at)
  VALUES (applicant_id, submission_time)
  ON CONFLICT (account_id, submitted_at) DO UPDATE SET status = 'queued', attempts = 0, available_at = now(),
    lease_id = NULL, lease_expires_at = NULL, started_at = NULL, completed_at = NULL, updated_at = now(), last_error = NULL
  RETURNING j.id INTO job_id;
  RETURN jsonb_build_object('jobId', job_id, 'status', 'queued');
END $$;

CREATE FUNCTION travelbuddy_private.claim_buddy_verification_job() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH ready AS (
    SELECT j.id
    FROM travelbuddy_private.buddy_verification_jobs j
    JOIN travelbuddy_private.buddy_applications b ON b.account_id = j.account_id
      AND b.submitted_at = j.submitted_at AND b.status = 'pending'
    WHERE (j.status = 'queued' AND j.available_at <= now())
      OR (j.status = 'running' AND j.lease_expires_at < now())
    ORDER BY CASE WHEN j.status = 'running' THEN j.lease_expires_at ELSE j.available_at END, j.id
    LIMIT 1 FOR UPDATE OF j SKIP LOCKED
  ), claimed AS (
    UPDATE travelbuddy_private.buddy_verification_jobs j SET
      status = 'running', attempts = j.attempts + 1, lease_id = gen_random_uuid(),
      lease_expires_at = now() + interval '120 seconds',
      started_at = coalesce(j.started_at, now()), updated_at = now()
    FROM ready WHERE j.id = ready.id
    RETURNING j.*
  )
  SELECT jsonb_build_object(
    'jobId', j.id, 'leaseId', j.lease_id, 'attempts', j.attempts,
    'accountId', j.account_id, 'submittedAt', j.submitted_at,
    'details', b.details - 'livenessSessionId', 'livenessSessionId', b.details->>'livenessSessionId',
    'recentSubmissions24h', 1 + (
      SELECT count(DISTINCT r.submitted_at) FROM travelbuddy_private.buddy_verification_runs r
      WHERE r.account_id = j.account_id AND r.created_at >= now() - interval '24 hours'
        AND r.submitted_at <> j.submitted_at
    ),
    'consecutiveSpoofFailures', (
      WITH ordered AS (
        SELECT r.liveness_status, row_number() OVER (ORDER BY r.created_at DESC, r.id DESC) AS rn
        FROM travelbuddy_private.buddy_verification_runs r
        WHERE r.account_id = j.account_id
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 10
      )
      SELECT count(*) FROM ordered o
      WHERE coalesce(o.liveness_status, '') IN ('spoof', 'failed')
        AND o.rn < coalesce((
          SELECT min(o2.rn) FROM ordered o2
          WHERE coalesce(o2.liveness_status, '') NOT IN ('spoof', 'failed')
        ), 11)
    ),
    'images', coalesce((
      SELECT jsonb_object_agg(i.kind, jsonb_build_object(
        'mimeType', i.mime_type, 'base64', replace(encode(i.content, 'base64'), E'\n', '')
      )) FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = j.account_id
    ), '{}'::jsonb)
  )
  FROM claimed j
  JOIN travelbuddy_private.buddy_applications b ON b.account_id = j.account_id AND b.submitted_at = j.submitted_at
$$;

CREATE FUNCTION travelbuddy_private.check_buddy_credential_duplicates(
  p_account_id uuid, p_nic_hmac text DEFAULT NULL, p_plate text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'duplicateNic', EXISTS (
      SELECT 1 FROM travelbuddy_private.buddy_credentials c WHERE c.account_id <> p_account_id AND c.nic_hmac = p_nic_hmac
    ),
    'duplicatePlate', EXISTS (
      SELECT 1 FROM travelbuddy_private.buddy_credentials c WHERE c.account_id <> p_account_id AND c.vehicle_plate_normalized = p_plate
    )
  )
$$;

CREATE FUNCTION travelbuddy_private.lock_buddy_verification_job(p_job_id uuid, p_lease_id uuid)
RETURNS travelbuddy_private.buddy_verification_jobs
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  job travelbuddy_private.buddy_verification_jobs;
  applicant uuid;
BEGIN
  SELECT j.account_id INTO applicant FROM travelbuddy_private.buddy_verification_jobs j WHERE j.id = p_job_id;
  PERFORM 1 FROM travelbuddy_backend.accounts a WHERE a.id = applicant FOR UPDATE;
  PERFORM 1 FROM travelbuddy_private.buddy_applications b WHERE b.account_id = applicant FOR UPDATE;
  SELECT j.* INTO job FROM travelbuddy_private.buddy_verification_jobs j
  WHERE j.id = p_job_id AND j.lease_id = p_lease_id AND j.status = 'running' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification job lease is no longer current.' USING ERRCODE = '40001';
  END IF;
  RETURN job;
END $$;

CREATE FUNCTION travelbuddy_private.complete_buddy_verification_job(p_job_id uuid, p_lease_id uuid, p_outcome jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job travelbuddy_private.buddy_verification_jobs := travelbuddy_private.lock_buddy_verification_job(p_job_id, p_lease_id);
  effective_status text := p_outcome->>'effectiveStatus';
  bucket text := p_outcome->>'decisionBucket';
  pipeline_version text := p_outcome->>'pipelineVersion';
  shadow_mode boolean := (p_outcome->>'shadowMode')::boolean;
  v_nic_hmac text := nullif(p_outcome->'credentials'->>'nicHmac', '');
  v_plate text := nullif(p_outcome->'credentials'->>'vehiclePlateNormalized', '');
  v_dup_nic boolean := false;
  v_dup_plate boolean := false;
  v_rule_outcomes jsonb := coalesce(p_outcome->'ruleOutcomes', '[]'::jsonb);
BEGIN
  UPDATE travelbuddy_private.buddy_verification_jobs j SET
    status = 'completed', lease_id = NULL, lease_expires_at = NULL, completed_at = now(), updated_at = now()
  WHERE j.id = job.id;

  IF NOT EXISTS (
    SELECT 1 FROM travelbuddy_private.buddy_applications b WHERE b.account_id = job.account_id
      AND b.submitted_at = job.submitted_at AND b.status = 'pending'
  ) THEN
    RETURN jsonb_build_object('applied', false, 'stale', true, 'status', 'stale');
  END IF;

  IF coalesce(effective_status, '') NOT IN ('approved', 'manual_review', 'changes_requested')
    OR coalesce(bucket, '') NOT IN ('green', 'amber', 'red')
    OR shadow_mode IS NULL OR nullif(trim(pipeline_version), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid verification outcome.' USING ERRCODE = '22023';
  END IF;

  IF NOT shadow_mode AND effective_status = 'approved' AND bucket = 'green' THEN
    IF v_nic_hmac IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('buddy_nic:' || v_nic_hmac, 0));
      SELECT EXISTS (
        SELECT 1 FROM travelbuddy_private.buddy_credentials c
        WHERE c.account_id <> job.account_id AND c.nic_hmac = v_nic_hmac
      ) INTO v_dup_nic;
    END IF;
    IF v_plate IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('buddy_plate:' || v_plate, 0));
      SELECT EXISTS (
        SELECT 1 FROM travelbuddy_private.buddy_credentials c
        WHERE c.account_id <> job.account_id AND c.vehicle_plate_normalized = v_plate
      ) INTO v_dup_plate;
    END IF;
    IF v_dup_nic OR v_dup_plate THEN
      bucket := 'amber';
      effective_status := 'manual_review';
      IF v_dup_nic THEN
        v_rule_outcomes := v_rule_outcomes || jsonb_build_array(jsonb_build_object(
          'code', 'NIC-05',
          'status', 'amber',
          'message', 'Identity is already registered on another account; routed to manual review.'
        ));
      END IF;
      IF v_dup_plate THEN
        v_rule_outcomes := v_rule_outcomes || jsonb_build_array(jsonb_build_object(
          'code', 'VEH-07',
          'status', 'amber',
          'message', 'Vehicle plate is already registered on another account; routed to manual review.'
        ));
      END IF;
    END IF;
  END IF;

  INSERT INTO travelbuddy_private.buddy_verification_runs (
    account_id, submitted_at, provider_mode, shadow_mode, pipeline_version, decision_bucket,
    liveness_status, nic_face_score, dl_face_score, pdf417_passed, extracted_summary,
    rule_outcomes, applicant_feedback, latency_ms
  ) VALUES (
    job.account_id, job.submitted_at, p_outcome->>'providerMode', shadow_mode, pipeline_version, bucket,
    p_outcome->>'livenessStatus', (p_outcome->>'nicFaceScore')::numeric, (p_outcome->>'dlFaceScore')::numeric,
    (p_outcome->>'pdf417Passed')::boolean, p_outcome->'extractedSummary',
    v_rule_outcomes, p_outcome->>'applicantFeedback', (p_outcome->>'latencyMs')::int
  );

  IF shadow_mode OR effective_status = 'manual_review' OR bucket = 'amber' THEN
    effective_status := 'manual_review';
    UPDATE travelbuddy_private.buddy_applications b SET status = effective_status,
      verification_bucket = bucket, decision_source = 'automated', review_message = NULL
    WHERE b.account_id = job.account_id;
  ELSIF effective_status = 'approved' AND bucket = 'green' THEN
    PERFORM travelbuddy_private.decide_buddy_application(job.account_id, job.submitted_at, 'approved',
      'automated:' || pipeline_version, NULL, p_outcome->'credentials', 'automated');
  ELSE
    effective_status := 'changes_requested';
    PERFORM travelbuddy_private.decide_buddy_application(job.account_id, job.submitted_at, effective_status,
      'automated:' || pipeline_version,
      coalesce(nullif(trim(p_outcome->>'applicantFeedback'), ''), 'Please review and re-upload your documents.'),
      NULL, 'automated');
  END IF;

  RETURN jsonb_build_object('applied', true, 'stale', false, 'status', effective_status);
END $$;

CREATE FUNCTION travelbuddy_private.fail_buddy_verification_job(
  p_job_id uuid, p_lease_id uuid, p_error text, p_max_attempts int DEFAULT 3
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job travelbuddy_private.buddy_verification_jobs := travelbuddy_private.lock_buddy_verification_job(p_job_id, p_lease_id);
BEGIN
  IF p_max_attempts IS NULL OR p_max_attempts < 1 THEN
    RAISE EXCEPTION 'The verification attempt limit must be positive.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM travelbuddy_private.buddy_applications b WHERE b.account_id = job.account_id
      AND b.submitted_at = job.submitted_at AND b.status = 'pending'
  ) THEN
    UPDATE travelbuddy_private.buddy_verification_jobs j SET
      status = 'completed', lease_id = NULL, lease_expires_at = NULL, completed_at = now(), updated_at = now()
    WHERE j.id = job.id;
    RETURN jsonb_build_object('escalatedToManualReview', false, 'attempts', job.attempts);
  END IF;

  IF job.attempts < p_max_attempts THEN
    UPDATE travelbuddy_private.buddy_verification_jobs j SET
      status = 'queued', lease_id = NULL, lease_expires_at = NULL, updated_at = now(),
      available_at = now() + make_interval(secs => 15 * (1 << least(3, job.attempts - 1))),
      last_error = left(p_error, 500)
    WHERE j.id = job.id;
    RETURN jsonb_build_object('escalatedToManualReview', false, 'attempts', job.attempts);
  END IF;

  UPDATE travelbuddy_private.buddy_verification_jobs j SET
    status = 'failed', lease_id = NULL, lease_expires_at = NULL, completed_at = now(), updated_at = now(),
    last_error = left(p_error, 500)
  WHERE j.id = job.id;

  INSERT INTO travelbuddy_private.buddy_verification_runs (
    account_id, submitted_at, provider_mode, shadow_mode, pipeline_version, decision_bucket,
    rule_outcomes, extracted_summary, latency_ms
  ) VALUES (
    job.account_id, job.submitted_at, 'unavailable', false, 'system', 'amber',
    '[{"code":"SYS-01","status":"amber","message":"Automated verification is unavailable."}]'::jsonb,
    '{}'::jsonb, 0
  );

  UPDATE travelbuddy_private.buddy_applications b SET status = 'manual_review',
    verification_bucket = 'amber', decision_source = 'automated', review_message = NULL
  WHERE b.account_id = job.account_id;
  RETURN jsonb_build_object('escalatedToManualReview', true, 'attempts', job.attempts);
END $$;

CREATE FUNCTION travelbuddy_private.sweep_buddy_verification_maintenance() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  local_today date := (now() AT TIME ZONE 'Asia/Colombo')::date;
  purged int := 0;
  notices jsonb;
  expired_application travelbuddy_private.buddy_applications;
BEGIN
  -- Lock the application before deleting evidence or scrubbing details.
  FOR expired_application IN
    SELECT b.* FROM travelbuddy_private.buddy_applications b
    WHERE b.submitted_at < now() - interval '14 days'
      AND b.status IN ('changes_requested', 'manual_review', 'pending')
      AND EXISTS (SELECT 1 FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = b.account_id)
    ORDER BY b.account_id FOR UPDATE OF b
  LOOP
    DELETE FROM travelbuddy_private.buddy_application_images i WHERE i.account_id = expired_application.account_id;
    IF FOUND THEN
      purged := purged + 1;
      IF expired_application.status IN ('pending', 'manual_review') THEN
        UPDATE travelbuddy_private.buddy_applications b SET
          status = 'changes_requested',
          details = jsonb_build_object('service', b.details->>'service'),
          reviewed_at = now(),
          reviewed_by = 'system:retention',
          review_message = 'Your verification photos expired after 14 days before review finished. Please upload fresh photos to reapply.',
          decision_source = 'automated'
        WHERE b.account_id = expired_application.account_id;
        UPDATE travelbuddy_private.buddy_verification_jobs j SET
          status = 'completed', lease_id = NULL, lease_expires_at = NULL,
          completed_at = now(), updated_at = now()
        WHERE j.account_id = expired_application.account_id
          AND j.submitted_at = expired_application.submitted_at
          AND j.status IN ('queued', 'running');
      ELSE
        UPDATE travelbuddy_private.buddy_applications b SET details = jsonb_build_object('service', b.details->>'service')
        WHERE b.account_id = expired_application.account_id;
      END IF;
    END IF;
  END LOOP;

  WITH locked_credentials AS (
    SELECT c.* FROM travelbuddy_private.buddy_credentials c
    WHERE (c.service = 'transport' AND c.transport_eligible AND
      (c.dl_expires_at <= local_today OR c.insurance_expires_at <= local_today OR c.erl_expires_at <= local_today))
      OR (c.last_expiry_notice_at IS DISTINCT FROM local_today
        AND EXISTS (SELECT 1 FROM travelbuddy_private.buddy_expiring_docs(c, local_today)))
    ORDER BY c.account_id FOR UPDATE OF c
  ), due AS (
    SELECT c.account_id, d.* FROM locked_credentials c
    CROSS JOIN LATERAL travelbuddy_private.buddy_expiring_docs(c, local_today) d
    WHERE c.last_expiry_notice_at IS DISTINCT FROM local_today
      AND (d.stage = '7d' OR c.last_expiry_notice_stage->>d.kind IS DISTINCT FROM d.stage)
  ), notice_stages AS (
    SELECT d.account_id, jsonb_object_agg(d.kind, d.stage) AS stages FROM due d GROUP BY d.account_id
  ), updated AS (
    UPDATE travelbuddy_private.buddy_credentials c SET
      transport_eligible = old.transport_eligible AND NOT coalesce(old.service = 'transport' AND (
        old.dl_expires_at <= local_today OR old.insurance_expires_at <= local_today OR old.erl_expires_at <= local_today
      ), false),
      last_expiry_notice_at = CASE WHEN n.stages IS NOT NULL THEN local_today ELSE old.last_expiry_notice_at END,
      last_expiry_notice_stage = old.last_expiry_notice_stage || coalesce(n.stages, '{}'::jsonb)
    FROM locked_credentials old LEFT JOIN notice_stages n ON n.account_id = old.account_id
    WHERE c.account_id = old.account_id
    RETURNING c.account_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'accountId', d.account_id, 'kind', d.kind, 'expiresAt', d.expires_at, 'daysRemaining', d.days_remaining, 'stage', d.stage
  ) ORDER BY d.account_id, d.expires_at, d.kind), '[]'::jsonb)
  INTO notices FROM due d JOIN updated u ON u.account_id = d.account_id;

  RETURN jsonb_build_object('purgedApplications', purged, 'expiryNotices', notices);
END $$;

CREATE FUNCTION travelbuddy_api.request_buddy_manual_review() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.request_buddy_manual_review()
$$;

CREATE FUNCTION travelbuddy_api.admin_list_buddy_applications(status_filter text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.admin_list_buddy_applications(status_filter)
$$;

CREATE FUNCTION travelbuddy_api.admin_get_buddy_application(applicant_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.admin_get_buddy_application(applicant_id)
$$;

CREATE FUNCTION travelbuddy_api.admin_buddy_application_image(
  applicant_id uuid, image_kind text, submission timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.admin_buddy_application_image(applicant_id, image_kind, submission)
$$;

CREATE FUNCTION travelbuddy_api.admin_review_buddy_application(
  applicant_id uuid, submission timestamptz, decision text, message text DEFAULT NULL, credentials jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.admin_review_buddy_application(applicant_id, submission, decision, message, credentials)
$$;

CREATE FUNCTION travelbuddy_api.admin_requeue_buddy_verification(
  applicant_id uuid, submission timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.admin_requeue_buddy_verification(applicant_id, submission)
$$;

CREATE FUNCTION travelbuddy_api.claim_buddy_verification_job() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.claim_buddy_verification_job()
$$;

CREATE FUNCTION travelbuddy_api.check_buddy_credential_duplicates(p_account_id uuid, p_nic_hmac text DEFAULT NULL, p_plate text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.check_buddy_credential_duplicates(p_account_id, p_nic_hmac, p_plate)
$$;

CREATE FUNCTION travelbuddy_api.complete_buddy_verification_job(p_job_id uuid, p_lease_id uuid, p_outcome jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.complete_buddy_verification_job(p_job_id, p_lease_id, p_outcome)
$$;

CREATE FUNCTION travelbuddy_api.fail_buddy_verification_job(p_job_id uuid, p_lease_id uuid, p_error text, p_max_attempts int DEFAULT 3) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.fail_buddy_verification_job(p_job_id, p_lease_id, p_error, p_max_attempts)
$$;

CREATE FUNCTION travelbuddy_api.get_buddy_application_image(
  p_account_id uuid, p_kind text, p_submission timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.get_buddy_application_image(p_account_id, p_kind, p_submission)
$$;

CREATE FUNCTION travelbuddy_api.sweep_buddy_verification_maintenance() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.sweep_buddy_verification_maintenance()
$$;

REVOKE ALL ON FUNCTION
  travelbuddy_private.buddy_expiring_docs(travelbuddy_private.buddy_credentials, date),
  travelbuddy_private.is_admin(),
  travelbuddy_private.set_account_admin(uuid, boolean),
  travelbuddy_private.decide_buddy_application(uuid, timestamptz, text, text, text, jsonb, text),
  travelbuddy_private.review_buddy_application(uuid, timestamptz, boolean, text, text),
  travelbuddy_private.buddy_verification_run_details(travelbuddy_private.buddy_verification_runs),
  travelbuddy_private.buddy_application_queue_fields(travelbuddy_private.buddy_applications),
  travelbuddy_private.lock_buddy_verification_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  travelbuddy_private.request_buddy_manual_review(),
  travelbuddy_api.request_buddy_manual_review(),
  travelbuddy_private.admin_list_buddy_applications(text),
  travelbuddy_api.admin_list_buddy_applications(text),
  travelbuddy_private.admin_get_buddy_application(uuid),
  travelbuddy_api.admin_get_buddy_application(uuid),
  travelbuddy_private.admin_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_api.admin_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_private.admin_review_buddy_application(uuid, timestamptz, text, text, jsonb),
  travelbuddy_api.admin_review_buddy_application(uuid, timestamptz, text, text, jsonb),
  travelbuddy_private.admin_requeue_buddy_verification(uuid, timestamptz),
  travelbuddy_api.admin_requeue_buddy_verification(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  travelbuddy_private.request_buddy_manual_review(),
  travelbuddy_api.request_buddy_manual_review(),
  travelbuddy_private.admin_list_buddy_applications(text),
  travelbuddy_api.admin_list_buddy_applications(text),
  travelbuddy_private.admin_get_buddy_application(uuid),
  travelbuddy_api.admin_get_buddy_application(uuid),
  travelbuddy_private.admin_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_api.admin_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_private.admin_review_buddy_application(uuid, timestamptz, text, text, jsonb),
  travelbuddy_api.admin_review_buddy_application(uuid, timestamptz, text, text, jsonb),
  travelbuddy_private.admin_requeue_buddy_verification(uuid, timestamptz),
  travelbuddy_api.admin_requeue_buddy_verification(uuid, timestamptz)
  TO authenticated;

REVOKE ALL ON FUNCTION
  travelbuddy_private.claim_buddy_verification_job(),
  travelbuddy_api.claim_buddy_verification_job(),
  travelbuddy_private.check_buddy_credential_duplicates(uuid, text, text),
  travelbuddy_api.check_buddy_credential_duplicates(uuid, text, text),
  travelbuddy_private.complete_buddy_verification_job(uuid, uuid, jsonb),
  travelbuddy_api.complete_buddy_verification_job(uuid, uuid, jsonb),
  travelbuddy_private.fail_buddy_verification_job(uuid, uuid, text, int),
  travelbuddy_api.fail_buddy_verification_job(uuid, uuid, text, int),
  travelbuddy_private.get_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_api.get_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_private.sweep_buddy_verification_maintenance(),
  travelbuddy_api.sweep_buddy_verification_maintenance()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  travelbuddy_private.claim_buddy_verification_job(),
  travelbuddy_api.claim_buddy_verification_job(),
  travelbuddy_private.check_buddy_credential_duplicates(uuid, text, text),
  travelbuddy_api.check_buddy_credential_duplicates(uuid, text, text),
  travelbuddy_private.complete_buddy_verification_job(uuid, uuid, jsonb),
  travelbuddy_api.complete_buddy_verification_job(uuid, uuid, jsonb),
  travelbuddy_private.fail_buddy_verification_job(uuid, uuid, text, int),
  travelbuddy_api.fail_buddy_verification_job(uuid, uuid, text, int),
  travelbuddy_private.get_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_api.get_buddy_application_image(uuid, text, timestamptz),
  travelbuddy_private.sweep_buddy_verification_maintenance(),
  travelbuddy_api.sweep_buddy_verification_maintenance()
  TO service_role;

NOTIFY pgrst, 'reload schema';
