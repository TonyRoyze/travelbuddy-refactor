-- Keep the local account identifier distinct from provider_presence.provider_id.
CREATE OR REPLACE FUNCTION travelbuddy_private.set_live_now(live_now boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_provider_id uuid;
BEGIN
  IF live_now IS NULL THEN RAISE EXCEPTION 'Choose whether to accept requests.'; END IF;
  v_provider_id := travelbuddy_private.require_discovery_provider();
  INSERT INTO travelbuddy_private.provider_presence(provider_id, accepting, last_seen)
  VALUES (v_provider_id, live_now, clock_timestamp())
  ON CONFLICT (provider_id) DO UPDATE
  SET accepting = EXCLUDED.accepting, last_seen = EXCLUDED.last_seen;
  UPDATE travelbuddy_backend.accounts AS account
  SET data = account.data || jsonb_build_object('liveNow', live_now), updated_at = clock_timestamp()
  WHERE account.id = v_provider_id;
  RETURN travelbuddy_private.presence_data(v_provider_id);
END $$;

NOTIFY pgrst, 'reload schema';
