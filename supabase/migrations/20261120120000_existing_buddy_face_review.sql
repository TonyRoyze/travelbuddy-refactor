-- Let existing hosts submit for review without changing their account privileges.
CREATE OR REPLACE FUNCTION travelbuddy_private.submit_buddy_application(application jsonb, images jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  account_info jsonb := travelbuddy_private.account();
  applicant uuid := (account_info->>'id')::uuid;
  existing_status text;
  service text := application->>'service';
  document_type text := application->>'documentType';
  birth_date date := (application->>'birthDate')::date;
  phone text := regexp_replace(application->>'phone', '[[:space:]-]', '', 'g');
  expected text[] := ARRAY['id-front', 'selfie'];
  item text;
  encoded text;
  content_type text;
  image_bytes bytea;
BEGIN
  -- Serialize decisions, application replacement and role changes on the same account.
  PERFORM 1 FROM travelbuddy_backend.accounts
    WHERE id = applicant AND supabase_user_id = actor AND schema_version = 1
      AND data->>'status' = 'active' AND (data->>'onboarding' = 'pending' OR (
        data->>'onboarding' = 'completed' AND data->'roles' ?| ARRAY['provider', 'guide']
      )) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account cannot submit a buddy application.' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO existing_status FROM travelbuddy_private.buddy_applications WHERE account_id = applicant;
  IF existing_status = 'pending' THEN
    RETURN travelbuddy_private.buddy_application_status();
  END IF;

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
  THEN
    RAISE EXCEPTION 'Enter valid application details. Buddies must be at least 18.' USING ERRCODE = '22023';
  END IF;

  IF document_type = 'nic' THEN expected := expected || ARRAY['id-back']; END IF;
  IF service = 'guide' THEN
    IF length(trim(coalesce(application->>'guideLicence', ''))) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Enter your SLTDA licence number.' USING ERRCODE = '22023';
    END IF;
    expected := expected || ARRAY['guide-licence'];
  ELSIF service = 'transport' THEN
    expected := expected || ARRAY['driving-licence', 'vehicle', 'insurance'];
  END IF;

  IF jsonb_typeof(images) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Attach the required application images.' USING ERRCODE = '22023';
  END IF;
  IF NOT (images ?& expected)
    OR (SELECT count(*) FROM jsonb_object_keys(images)) <> cardinality(expected)
  THEN
    RAISE EXCEPTION 'Attach the required application images.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO travelbuddy_private.buddy_applications (account_id, status, details)
  VALUES (applicant, 'pending', jsonb_build_object(
    'displayName', trim(application->>'displayName'), 'legalName', trim(application->>'legalName'),
    'birthDate', birth_date, 'phone', '+94' || right(phone, 9),
    'documentType', document_type, 'service', service,
    'homeBase', trim(application->>'homeBase'), 'languages', trim(application->>'languages'),
    'intro', trim(coalesce(application->>'intro', '')),
    'faceComparisonConsent', coalesce(application->'faceComparisonConsent' = 'true'::jsonb, false),
    'guideLicence', CASE WHEN service = 'guide' THEN trim(application->>'guideLicence') END
  ))
  ON CONFLICT (account_id) DO UPDATE SET
    status = 'pending', details = excluded.details, submitted_at = excluded.submitted_at,
    reviewed_at = NULL, reviewed_by = NULL, review_message = NULL;

  FOREACH item IN ARRAY expected LOOP
    encoded := images->item->>'base64';
    content_type := images->item->>'type';
    IF encoded IS NULL OR length(encoded) > 2796204 THEN
      RAISE EXCEPTION 'Each application image must be 2 MB or smaller.' USING ERRCODE = '22023';
    END IF;
    image_bytes := decode(encoded, 'base64');
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
    INSERT INTO travelbuddy_private.buddy_application_images VALUES (applicant, item, content_type, image_bytes);
  END LOOP;

  RETURN travelbuddy_private.buddy_application_status();
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.review_buddy_application(
  applicant uuid, submission timestamptz, approved boolean, reviewer text, message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE pending travelbuddy_private.buddy_applications;
BEGIN
  IF approved IS NULL OR length(trim(coalesce(reviewer, ''))) NOT BETWEEN 1 AND 120
    OR length(coalesce(message, '')) > 1000
    OR (NOT approved AND trim(coalesce(message, '')) = '') THEN
    RAISE EXCEPTION 'Enter the reviewer and a reason when requesting changes.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM travelbuddy_backend.accounts WHERE id = applicant AND schema_version = 1
    AND data->>'status' = 'active' AND (data->>'onboarding' = 'pending' OR (
        data->>'onboarding' = 'completed' AND data->'roles' ?| ARRAY['provider', 'guide']
      )) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The applicant account is unavailable.' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO pending FROM travelbuddy_private.buddy_applications
    WHERE account_id = applicant AND status = 'pending' AND submitted_at = submission;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The pending application changed. Reload before reviewing.' USING ERRCODE = '40001';
  END IF;

  IF approved THEN
    UPDATE travelbuddy_backend.accounts SET
      data = data || jsonb_build_object(
        'displayName', pending.details->>'displayName',
        'roles', jsonb_build_array('guide'),
        'onboarding', 'completed',
        'profileDetails', coalesce(data->'profileDetails', '{}'::jsonb) || jsonb_build_object(
          'homeBase', pending.details->>'homeBase', 'languages', pending.details->>'languages', 'bio', pending.details->>'intro'
        )
      ),
      revision = revision + 1, updated_at = now()
    WHERE id = applicant AND data->>'onboarding' = 'pending';
  END IF;

  DELETE FROM travelbuddy_private.buddy_application_images WHERE account_id = applicant;
  UPDATE travelbuddy_private.buddy_applications SET status = CASE WHEN approved THEN 'approved' ELSE 'changes_requested' END,
    details = jsonb_build_object('service', pending.details->>'service'),
    reviewed_at = now(), reviewed_by = trim(reviewer),
    review_message = CASE WHEN NOT approved THEN trim(message) END
  WHERE account_id = applicant;
END $$;

NOTIFY pgrst, 'reload schema';
