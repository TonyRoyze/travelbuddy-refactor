-- Provider inbox uses the same private bookings and conversations as travellers.
CREATE TABLE travelbuddy_private.conversation_reads (
 account_id uuid NOT NULL REFERENCES travelbuddy_backend.accounts(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES travelbuddy_backend.conversations(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL,
 PRIMARY KEY(account_id,conversation_id)
);
CREATE INDEX conversation_reads_thread_idx ON travelbuddy_private.conversation_reads(conversation_id);
ALTER TABLE travelbuddy_private.conversation_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON travelbuddy_private.conversation_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON travelbuddy_private.conversation_reads TO travelbuddy_api_executor;
CREATE POLICY api_executor_access ON travelbuddy_private.conversation_reads TO travelbuddy_api_executor USING(true) WITH CHECK(true);

CREATE FUNCTION travelbuddy_private.mark_conversation_read(conversation_id uuid,through_message_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); seen timestamptz;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.conversations c WHERE c.id=conversation_id AND (a->>'id')::uuid IN(c.participant_one_id,c.participant_two_id)) THEN RAISE EXCEPTION 'Conversation not found.' USING ERRCODE='42501'; END IF;
 SELECT m.created_at INTO seen FROM travelbuddy_backend.messages m WHERE m.id=through_message_id AND m.conversation_id=mark_conversation_read.conversation_id;
 IF seen IS NULL THEN RETURN; END IF;
 INSERT INTO travelbuddy_private.conversation_reads AS r(account_id,conversation_id,read_at) VALUES((a->>'id')::uuid,conversation_id,seen)
 ON CONFLICT ON CONSTRAINT conversation_reads_pkey DO UPDATE SET read_at=greatest(r.read_at,excluded.read_at);
END $$;
CREATE OR REPLACE FUNCTION travelbuddy_private.conversations() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(row_data ORDER BY updated_at DESC,id),'[]') INTO result FROM (
 SELECT c.id,c.updated_at,jsonb_build_object('id',c.id,'packageId',c.package_id,'packageTitle',p.title,'name',other.data->>'displayName','updatedAt',c.updated_at,
 'unread',(SELECT count(*) FROM travelbuddy_backend.messages m WHERE m.conversation_id=c.id AND m.recipient_id=(a->>'id')::uuid AND m.created_at>coalesce(r.read_at,'-infinity'::timestamptz)),
 'preview',(SELECT body FROM travelbuddy_backend.messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)) row_data
 FROM travelbuddy_backend.conversations c JOIN travelbuddy_backend.accounts other ON other.id=CASE WHEN c.participant_one_id=(a->>'id')::uuid THEN c.participant_two_id ELSE c.participant_one_id END
 LEFT JOIN travelbuddy_backend.packages p ON p.id=c.package_id LEFT JOIN travelbuddy_private.conversation_reads r ON r.account_id=(a->>'id')::uuid AND r.conversation_id=c.id
 WHERE (a->>'id')::uuid IN(c.participant_one_id,c.participant_two_id) ORDER BY c.updated_at DESC,c.id LIMIT 100) rows;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.provider_dashboard(filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=travelbuddy_private.require_discovery_provider(); result jsonb; page_no int:=coalesce((filters->>'page')::int,1);
BEGIN
 IF page_no NOT BETWEEN 1 AND 10000 OR coalesce(filters->>'status','All') NOT IN('All','Upcoming','Completed','Cancelled') OR length(coalesce(filters->>'q',''))>120 THEN RAISE EXCEPTION 'Invalid dashboard filters.'; END IF;
 WITH owned AS (
 SELECT b.*,travelbuddy_private.booking_data(b) doc FROM travelbuddy_backend.scheduled_bookings b JOIN travelbuddy_backend.packages p ON p.id=b.package_id WHERE p.owner_id=owner
 ), matches AS (
 SELECT * FROM owned WHERE (coalesce(filters->>'status','All')='All' OR doc->>'status'=filters->>'status')
 AND (coalesce(filters->>'packageId','')='' OR package_id=filters->>'packageId')
 AND (coalesce(filters->>'date','')='' OR date=(filters->>'date')::date)
 AND (coalesce(filters->>'q','')='' OR concat_ws(' ',traveler_name,doc->>'reference',snapshot->>'title') ILIKE '%'||(filters->>'q')||'%')
 ), page AS(SELECT * FROM matches ORDER BY date DESC,time DESC,id LIMIT 30 OFFSET (page_no-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(doc ORDER BY date DESC,time DESC,id) FROM page),'[]'),
 'total',(SELECT count(*) FROM matches),'page',page_no,'pageSize',30,
 'upcoming',(SELECT count(*) FROM owned WHERE doc->>'status'='Upcoming'),
 'today',(SELECT count(*) FROM owned WHERE doc->>'status'='Upcoming' AND date=(now() AT TIME ZONE 'Asia/Colombo')::date),
 'conversations',(SELECT coalesce(jsonb_agg(thread),'[]') FROM jsonb_array_elements(travelbuddy_private.conversations()) thread WHERE EXISTS(SELECT 1 FROM travelbuddy_backend.packages pack WHERE pack.id=thread->>'packageId' AND pack.owner_id=owner))) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.booking_chat(booking_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); host uuid; traveler uuid; package text; result uuid;
BEGIN
 SELECT p.owner_id,o.traveler_id,p.id INTO host,traveler,package FROM travelbuddy_backend.scheduled_bookings b JOIN travelbuddy_backend.booking_orders o ON o.id=b.order_id JOIN travelbuddy_backend.packages p ON p.id=b.package_id WHERE b.id=booking_id;
 IF host IS NULL OR (a->>'id')::uuid NOT IN(host,traveler) OR host=traveler THEN RAISE EXCEPTION 'Booking not found.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.accounts h WHERE h.id=host AND h.data->>'status'='active' AND h.data->>'onboarding'='completed' AND h.data->'roles' ?| ARRAY['provider','guide']) THEN RAISE EXCEPTION 'Provider unavailable.' USING ERRCODE='42501'; END IF;
 INSERT INTO travelbuddy_backend.conversations(id,participant_one_id,participant_two_id,context_key,package_id,updated_at)
 VALUES(gen_random_uuid(),least(host,traveler),greatest(host,traveler),'package:'||package,package,now())
 ON CONFLICT(participant_one_id,participant_two_id,context_key) DO UPDATE SET context_key=excluded.context_key RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_api.provider_dashboard(filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.provider_dashboard(filters)$$;
CREATE FUNCTION travelbuddy_api.booking_chat(booking_id uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.booking_chat(booking_id)$$;
CREATE FUNCTION travelbuddy_api.mark_conversation_read(conversation_id uuid,through_message_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.mark_conversation_read(conversation_id,through_message_id)$$;
DO $$DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('travelbuddy_private','travelbuddy_api') AND p.proname IN('provider_dashboard','booking_chat','mark_conversation_read','conversations') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,service_role',f.signature);
 IF f.nspname='travelbuddy_private' THEN EXECUTE format('ALTER FUNCTION %s OWNER TO travelbuddy_api_executor',f.signature); END IF;
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
