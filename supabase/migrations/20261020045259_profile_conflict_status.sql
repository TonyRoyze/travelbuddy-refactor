-- Revision mismatches are application conflicts, not retryable transaction failures.
-- Return HTTP 409 directly so proxies do not retry the stale request.
DO $$
DECLARE signature regprocedure; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'travelbuddy_private.save_profile(jsonb,integer)'::regprocedure,
  'travelbuddy_private.set_profile_media(jsonb,integer)'::regprocedure,
  'travelbuddy_private.commit_profile_upload(uuid,jsonb,integer)'::regprocedure
 ] LOOP
  SELECT pg_get_functiondef(signature) INTO definition;
  IF position('40001' in definition)=0 THEN RAISE EXCEPTION 'Expected profile conflict guard is missing: %',signature; END IF;
  EXECUTE replace(definition,'''40001''','''PT409''');
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
