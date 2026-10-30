-- Keep provider opt-in, heartbeat, and public availability on the same state.
CREATE OR REPLACE FUNCTION travelbuddy_private.set_live_now(live_now boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE provider_id uuid;
BEGIN
  IF live_now IS NULL THEN RAISE EXCEPTION 'Choose whether to accept requests.'; END IF;
  provider_id := travelbuddy_private.require_discovery_provider();
  INSERT INTO travelbuddy_private.provider_presence(provider_id, accepting, last_seen)
  VALUES (provider_id, live_now, clock_timestamp())
  ON CONFLICT (provider_id) DO UPDATE
  SET accepting = EXCLUDED.accepting, last_seen = EXCLUDED.last_seen;
  UPDATE travelbuddy_backend.accounts
  SET data = data || jsonb_build_object('liveNow', live_now), updated_at = clock_timestamp()
  WHERE id = provider_id;
  RETURN travelbuddy_private.presence_data(provider_id);
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.set_provider_accepting(accepting_requests boolean)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT travelbuddy_private.set_live_now(accepting_requests)
$$;

-- The public badge follows a fresh heartbeat; a stale preference cannot imply
-- that a provider is currently available.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('travelbuddy_private.account()'::regprocedure) INTO definition;
  definition := replace(definition,
    'coalesce((a.data->>''liveNow'')::boolean,false)',
    'coalesce((SELECT presence.accepting AND presence.last_seen > clock_timestamp()-interval ''2 minutes'' FROM travelbuddy_private.provider_presence presence WHERE presence.provider_id=a.id),false)');
  IF definition NOT LIKE '%presence.last_seen > clock_timestamp()%' THEN RAISE EXCEPTION 'Could not update account live presence'; END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef('travelbuddy_private.package_detail(text)'::regprocedure) INTO definition;
  definition := replace(definition,
    'coalesce((a.data->>''liveNow'')::boolean,false)',
    'coalesce((SELECT presence.accepting AND presence.last_seen > clock_timestamp()-interval ''2 minutes'' FROM travelbuddy_private.provider_presence presence WHERE presence.provider_id=a.id),false)');
  IF definition NOT LIKE '%presence.last_seen > clock_timestamp()%' THEN RAISE EXCEPTION 'Could not update package live presence'; END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef('travelbuddy_private.catalog(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition,
    'coalesce((a.data->>''liveNow'')::boolean,false) AS provider_live_now',
    'coalesce((SELECT presence.accepting AND presence.last_seen > clock_timestamp()-interval ''2 minutes'' FROM travelbuddy_private.provider_presence presence WHERE presence.provider_id=a.id),false) AS provider_live_now');
  IF definition NOT LIKE '%presence.last_seen > clock_timestamp()%' THEN RAISE EXCEPTION 'Could not update catalog live presence'; END IF;
  EXECUTE definition;
END $$;

-- Keyset pagination uses a stable (created_at,id) cursor, avoiding large
-- offsets and keeping older messages available as conversations grow.
CREATE FUNCTION travelbuddy_private.message_page(
  conversation_id uuid,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid := (travelbuddy_private.account()->>'id')::uuid; result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM travelbuddy_backend.conversations c
    WHERE c.id = conversation_id AND owner_id IN (c.participant_one_id,c.participant_two_id)
  ) THEN RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '42501'; END IF;
  IF (before_created_at IS NULL) <> (before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid message cursor.';
  END IF;
  WITH page AS MATERIALIZED (
    SELECT m.id,m.created_at,m.sender_id,m.body,m.package
    FROM travelbuddy_backend.messages m
    WHERE m.conversation_id = message_page.conversation_id
      AND (before_created_at IS NULL OR (m.created_at,m.id) < (before_created_at,before_id))
    ORDER BY m.created_at DESC,m.id DESC LIMIT 51
  ), numbered AS (
    SELECT *,row_number() OVER (ORDER BY created_at DESC,id DESC) AS position FROM page
  ), visible AS (
    SELECT * FROM numbered WHERE position <= 50
  )
  SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'senderId',sender_id,'body',body,'package',package,'createdAt',created_at
    ) ORDER BY created_at,id) FROM visible),'[]'::jsonb),
    'hasMore',(SELECT count(*) > 50 FROM page),
    'nextBefore',CASE WHEN (SELECT count(*) > 50 FROM page) THEN (
      SELECT jsonb_build_object('createdAt',created_at,'id',id)
      FROM visible ORDER BY created_at,id LIMIT 1
    ) ELSE NULL END
  ) INTO result;
  RETURN result;
END $$;

ALTER FUNCTION travelbuddy_private.message_page(uuid,timestamptz,uuid) OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_private.message_page(uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION travelbuddy_private.message_page(uuid,timestamptz,uuid) TO authenticated;
CREATE FUNCTION travelbuddy_api.message_page(
  conversation_id uuid,
  before_created_at timestamptz DEFAULT NULL,
  before_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.message_page(conversation_id,before_created_at,before_id)
$$;
REVOKE ALL ON FUNCTION travelbuddy_api.message_page(uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION travelbuddy_api.message_page(uuid,timestamptz,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
