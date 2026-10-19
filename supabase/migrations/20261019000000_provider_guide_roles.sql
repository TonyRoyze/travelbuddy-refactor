-- Separate accommodation providers from local experience guides at signup.
CREATE OR REPLACE FUNCTION travelbuddy_private.onboard(display_name text, account_type text, expected_revision int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb := travelbuddy_private.account();
BEGIN
 IF length(trim(display_name)) NOT BETWEEN 1 AND 120 OR account_type NOT IN ('traveler','provider','guide','buddy') OR display_name IS NULL OR account_type IS NULL THEN
  RAISE EXCEPTION 'Enter a name and choose Traveller, Provider, or Guide.';
 END IF;
 UPDATE travelbuddy_backend.accounts
 SET data=data||jsonb_build_object(
   'displayName',trim(display_name),
   'roles',jsonb_build_array(CASE WHEN account_type='buddy' THEN 'guide' ELSE account_type END),
   'onboarding','completed'
 ),revision=revision+1,updated_at=now()
 WHERE id=(a->>'id')::uuid AND revision=expected_revision AND data->>'onboarding'='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Registration is complete or your account changed. Reload.' USING ERRCODE='40001'; END IF;
 RETURN travelbuddy_private.account();
END $$;
NOTIFY pgrst, 'reload schema';
