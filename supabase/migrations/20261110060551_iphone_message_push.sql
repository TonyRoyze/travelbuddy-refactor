-- Device tokens and the delivery queue are private; only narrow RPCs are exposed.
CREATE TABLE travelbuddy_private.push_devices (
  token text PRIMARY KEY CHECK (length(token) BETWEEN 64 AND 512 AND token !~ '[^0-9a-f]'),
  user_id uuid NOT NULL REFERENCES travelbuddy_backend.accounts(supabase_user_id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, installation_id)
);
CREATE TABLE travelbuddy_private.message_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES travelbuddy_backend.messages(id) ON DELETE CASCADE,
  token text NOT NULL REFERENCES travelbuddy_private.push_devices(token) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES travelbuddy_backend.accounts(supabase_user_id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  lease_id uuid,
  completed_at timestamptz,
  UNIQUE(message_id, token)
);
CREATE INDEX message_push_ready ON travelbuddy_private.message_push_queue(available_at) WHERE completed_at IS NULL;
CREATE INDEX message_push_recipient ON travelbuddy_private.message_push_queue(recipient_id);
CREATE INDEX message_push_device ON travelbuddy_private.message_push_queue(token);
ALTER TABLE travelbuddy_private.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE travelbuddy_private.message_push_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON travelbuddy_private.push_devices, travelbuddy_private.message_push_queue FROM PUBLIC,anon,authenticated;

CREATE FUNCTION travelbuddy_api.register_push_device(device_token text, installation_id uuid, environment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := auth.uid();
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Sign in to enable notifications.' USING ERRCODE='42501'; END IF;
  IF device_token IS NULL OR length(device_token) NOT BETWEEN 64 AND 512 OR lower(device_token) ~ '[^0-9a-f]'
    OR installation_id IS NULL OR environment IS NULL OR environment NOT IN ('sandbox','production') THEN
    RAISE EXCEPTION 'Invalid push device.';
  END IF;
  PERFORM travelbuddy_private.account();
  -- Serialize registration for this token, including account switches.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(device_token), 0));
  DELETE FROM travelbuddy_private.push_devices d
  WHERE (d.token=lower(device_token) AND d.user_id<>owner_id)
    OR (d.user_id=owner_id AND d.installation_id=register_push_device.installation_id AND d.token<>lower(device_token));
  INSERT INTO travelbuddy_private.push_devices(token,user_id,installation_id,environment)
  VALUES(lower(device_token),owner_id,installation_id,environment)
  ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id, installation_id=EXCLUDED.installation_id,
    environment=EXCLUDED.environment,updated_at=now();
END $$;
CREATE FUNCTION travelbuddy_api.unregister_push_device(device_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM travelbuddy_private.push_devices WHERE token=lower(device_token) AND user_id=(SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION travelbuddy_api.register_push_device(text,uuid,text),travelbuddy_api.unregister_push_device(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_api.register_push_device(text,uuid,text),travelbuddy_api.unregister_push_device(text) TO authenticated;

CREATE FUNCTION travelbuddy_private.enqueue_message_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO travelbuddy_private.message_push_queue(message_id,token,recipient_id)
  SELECT NEW.id,d.token,d.user_id FROM travelbuddy_backend.conversations c
  JOIN travelbuddy_backend.accounts a ON a.id IN(c.participant_one_id,c.participant_two_id)
  JOIN travelbuddy_private.push_devices d ON d.user_id=a.supabase_user_id
  WHERE c.id=NEW.conversation_id AND a.id=NEW.recipient_id AND a.id<>NEW.sender_id
    AND NEW.sender_id IN(c.participant_one_id,c.participant_two_id)
  ON CONFLICT(message_id,token) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION travelbuddy_private.enqueue_message_push() FROM PUBLIC,anon,authenticated,service_role;
-- Insert only: attachment/package updates must not send duplicate alerts.
CREATE TRIGGER enqueue_message_push AFTER INSERT ON travelbuddy_backend.messages
FOR EACH ROW EXECUTE FUNCTION travelbuddy_private.enqueue_message_push();

CREATE FUNCTION travelbuddy_api.claim_message_push(delivery_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF delivery_environment IS NULL OR delivery_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'Invalid APNs environment'; END IF;
  -- Keep a bounded delivery history and remove abandoned/expired jobs.
  DELETE FROM travelbuddy_private.message_push_queue WHERE expires_at<now();
  WITH ready AS (
    SELECT q.id FROM travelbuddy_private.message_push_queue q
    JOIN travelbuddy_private.push_devices d ON d.token=q.token AND d.environment=delivery_environment
    WHERE q.completed_at IS NULL AND q.available_at<=now() AND q.attempts<6
    ORDER BY q.available_at LIMIT 10 FOR UPDATE OF q SKIP LOCKED
  ), claimed AS (
    UPDATE travelbuddy_private.message_push_queue q SET attempts=q.attempts+1,
      available_at=now()+interval '2 minutes',lease_id=gen_random_uuid()
    FROM ready WHERE q.id=ready.id RETURNING q.*
  ) SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'leaseId',q.lease_id,'token',q.token,'environment',d.environment,
    'recipientUserId',q.recipient_id,'conversationId',m.conversation_id,'messageId',m.id
  )),'[]'::jsonb) INTO result FROM claimed q
  JOIN travelbuddy_private.push_devices d ON d.token=q.token AND d.user_id=q.recipient_id
  JOIN travelbuddy_backend.messages m ON m.id=q.message_id;
  RETURN result;
END $$;
CREATE FUNCTION travelbuddy_api.finish_message_push(job_id uuid, lease_id uuid, outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE device_token text;
BEGIN
  IF outcome NOT IN ('sent','retry','invalid','failed') OR outcome IS NULL THEN RAISE EXCEPTION 'Invalid delivery outcome'; END IF;
  UPDATE travelbuddy_private.message_push_queue q
  SET completed_at=CASE WHEN outcome='retry' AND attempts<6 THEN NULL ELSE now() END,
      available_at=now()+make_interval(secs=>least(3600,30*power(2,q.attempts)::integer))
  WHERE q.id=job_id AND q.lease_id=finish_message_push.lease_id AND q.completed_at IS NULL
  RETURNING token INTO device_token;
  IF outcome='invalid' AND device_token IS NOT NULL THEN
    DELETE FROM travelbuddy_private.push_devices WHERE token=device_token;
  END IF;
END $$;
REVOKE ALL ON FUNCTION travelbuddy_api.claim_message_push(text),travelbuddy_api.finish_message_push(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION travelbuddy_api.claim_message_push(text),travelbuddy_api.finish_message_push(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
