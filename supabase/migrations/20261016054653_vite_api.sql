-- Additive API for the Vite application. Existing server tables remain private.
CREATE SCHEMA IF NOT EXISTS travelbuddy_api;
CREATE SCHEMA IF NOT EXISTS travelbuddy_private;
REVOKE ALL ON SCHEMA travelbuddy_private FROM PUBLIC;
GRANT USAGE ON SCHEMA travelbuddy_api, travelbuddy_private TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA travelbuddy_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA travelbuddy_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION travelbuddy_private.account() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a travelbuddy_backend.accounts; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.' USING ERRCODE='42501'; END IF;
 INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at)
 VALUES(gen_random_uuid(),uid,'{"displayName":"Traveler","roles":["traveler"],"status":"active","onboarding":"pending","avatarMediaId":null,"profileVideoIds":[],"profileDetails":{"bio":"","homeBase":"","languages":"","interests":"","travelStyle":"","specialties":"","yearsExperience":null}}',now())
 ON CONFLICT (supabase_user_id) DO NOTHING;
 SELECT * INTO a FROM travelbuddy_backend.accounts WHERE supabase_user_id=uid;
 IF a.schema_version<>1 OR a.data->>'status'<>'active' THEN RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',a.id,'displayName',a.data->>'displayName','roles',a.data->'roles','onboarding',a.data->>'onboarding','revision',a.revision,'email',auth.jwt()->>'email');
END $$;

CREATE FUNCTION travelbuddy_private.onboard(display_name text, account_type text, expected_revision int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb := travelbuddy_private.account();
BEGIN
 IF length(trim(display_name)) NOT BETWEEN 1 AND 120 OR account_type NOT IN ('traveler','buddy') OR display_name IS NULL OR account_type IS NULL THEN RAISE EXCEPTION 'Enter a name and choose Traveller or Buddy.'; END IF;
 UPDATE travelbuddy_backend.accounts SET data=data || jsonb_build_object('displayName',trim(display_name),'roles',jsonb_build_array(CASE WHEN account_type='buddy' THEN 'provider' ELSE 'traveler' END),'onboarding','completed'),revision=revision+1,updated_at=now()
 WHERE id=(a->>'id')::uuid AND revision=expected_revision AND data->>'onboarding'='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Registration is complete or your account changed. Reload.' USING ERRCODE='40001'; END IF;
 RETURN travelbuddy_private.account();
END $$;

-- Explicit allowlist: catalog records never expose ownership, schedules or account documents.
CREATE FUNCTION travelbuddy_private.package_data(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(data)
 WHERE key=ANY(ARRAY['id','title','destination','country','category','image','gallery','rating','reviews','price','originalPrice','duration','tag','freeCancellation','payLater','pickup','languages','supplier','description','highlights','included','notIncluded','meetingPoint','options','itinerary','videoIds']);
$$;
CREATE FUNCTION travelbuddy_private.catalog(filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; page_no int:=coalesce((filters->>'page')::int,1); page_size int:=24;
BEGIN
 IF page_no NOT BETWEEN 1 AND 10000 OR length(coalesce(filters->>'q',''))>120 OR coalesce(filters->>'sort','recommended') NOT IN ('recommended','price-low','rating') THEN RAISE EXCEPTION 'Invalid search filters.'; END IF;
 WITH matches AS (
 SELECT p.* FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active')
 AND (coalesce(filters->>'q','')='' OR concat_ws(' ',p.title,p.destination,p.country,p.category) ILIKE '%'||(filters->>'q')||'%')
 AND (coalesce(filters->>'category','')='' OR p.category=filters->>'category')
 AND (coalesce(filters->>'destination','')='' OR p.destination ILIKE '%'||(filters->>'destination')||'%')
 AND (filters->>'minPrice' IS NULL OR p.price >= (filters->>'minPrice')::numeric)
 AND (filters->>'maxPrice' IS NULL OR p.price <= (filters->>'maxPrice')::numeric)
 AND (coalesce((filters->>'freeCancellation')::boolean,false)=false OR p.free_cancellation)
 ), paged AS (SELECT * FROM matches ORDER BY CASE WHEN filters->>'sort'='price-low' THEN price END ASC,CASE WHEN filters->>'sort'='rating' THEN rating END DESC,sort_order,id LIMIT page_size OFFSET (page_no-1)*page_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(travelbuddy_private.package_data(data)) FROM paged),'[]'),'total',(SELECT count(*) FROM matches),'page',page_no,'pageSize',page_size) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.package_detail(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 SELECT travelbuddy_private.package_data(p.data)||jsonb_build_object('canChat',p.owner_id IS NOT NULL)
 INTO result FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.id=package_id AND p.published AND (p.owner_id IS NULL OR a.data->>'status'='active');
 IF result IS NULL THEN RAISE EXCEPTION 'Experience not found.' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

-- One schedule implementation for availability and reservation validation.
CREATE FUNCTION travelbuddy_private.slots(pack travelbuddy_backend.packages, day date, option_index int)
RETURNS TABLE(slot_time text, capacity int) LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE local_now timestamp:=now() AT TIME ZONE 'Asia/Colombo'; schedule jsonb:=pack.schedule; opt jsonb:=pack.data->'options'->option_index; exception jsonb;
BEGIN
 IF opt IS NULL OR option_index<0 OR day<local_now::date OR day>local_now::date+180 THEN RETURN; END IF;
 IF schedule='{}' THEN schedule:=jsonb_build_object('startDate',local_now::date,'endDate',local_now::date+180,'weekdays',jsonb_build_array(1,2,3,4,5,6),'exceptions','[]'::jsonb); END IF;
 IF day<(schedule->>'startDate')::date OR day>(schedule->>'endDate')::date THEN RETURN; END IF;
 SELECT x INTO exception FROM jsonb_array_elements(schedule->'exceptions') x WHERE x->>'date'=day::text;
 IF coalesce((exception->>'closed')::boolean,false) OR (exception IS NULL AND NOT (schedule->'weekdays' @> to_jsonb(extract(dow FROM day)::int))) THEN RETURN; END IF;
 RETURN QUERY SELECT DISTINCT t,coalesce((exception->>'capacity')::int,(opt->>'capacity')::int,12)
 FROM jsonb_array_elements_text(coalesce(exception->'times',opt->'times')) t
 WHERE day>local_now::date OR t>to_char(local_now,'HH24:MI') ORDER BY t;
END $$;
CREATE FUNCTION travelbuddy_private.availability(package_id text, day date, option_index int DEFAULT 0, travelers int DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pack travelbuddy_backend.packages; selected jsonb; next_slot jsonb;
BEGIN
 IF day IS NULL OR option_index IS NULL OR option_index NOT BETWEEN 0 AND 7 OR travelers IS NULL OR travelers NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Choose a valid date, option and traveler count.'; END IF;
 PERFORM travelbuddy_private.package_detail(package_id);
 SELECT * INTO pack FROM travelbuddy_backend.packages WHERE id=package_id;
 IF pack.data->'options'->option_index IS NULL THEN RAISE EXCEPTION 'Choose a valid experience option.'; END IF;
 WITH used AS (SELECT b.time,sum(b.travelers) n FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.date=day AND b.option_index=availability.option_index AND b.status='confirmed' GROUP BY b.time)
 SELECT coalesce(jsonb_agg(jsonb_build_object('time',s.slot_time,'capacity',s.capacity,'remaining',greatest(0,s.capacity-coalesce(u.n,0))) ORDER BY s.slot_time),'[]') INTO selected FROM travelbuddy_private.slots(pack,day,option_index) s LEFT JOIN used u ON u.time=s.slot_time;
 WITH used AS (SELECT b.date,b.time,sum(b.travelers) n FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.option_index=availability.option_index AND b.status='confirmed' AND b.date BETWEEN greatest(day,(now() AT TIME ZONE 'Asia/Colombo')::date) AND (now() AT TIME ZONE 'Asia/Colombo')::date+180 GROUP BY b.date,b.time)
 SELECT jsonb_build_object('date',d::date,'time',s.slot_time) INTO next_slot FROM generate_series(greatest(day,(now() AT TIME ZONE 'Asia/Colombo')::date)::timestamp,((now() AT TIME ZONE 'Asia/Colombo')::date+180)::timestamp,interval '1 day') d CROSS JOIN LATERAL travelbuddy_private.slots(pack,d::date,option_index) s LEFT JOIN used u ON u.date=d::date AND u.time=s.slot_time WHERE s.capacity-coalesce(u.n,0)>=travelers ORDER BY d,s.slot_time LIMIT 1;
 RETURN jsonb_build_object('date',day,'slots',selected,'next',next_slot);
END $$;
CREATE FUNCTION travelbuddy_private.booking_data(b travelbuddy_backend.scheduled_bookings) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT jsonb_build_object('id',b.id,'orderId',b.order_id,'experienceId',b.package_id,'option',b.option_index,'date',b.date,'time',b.time,'travelers',b.travelers,'total',b.total,'travelerName',b.traveler_name,'travelerEmail',b.traveler_email,'created',b.created_at,'reference','TB-'||upper(left(b.id::text,8)),'experience',travelbuddy_private.package_data(b.snapshot),'status',CASE WHEN b.status='cancelled' THEN 'Cancelled' WHEN ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')+make_interval(mins=>coalesce((SELECT p.duration_minutes FROM travelbuddy_backend.packages p WHERE p.id=b.package_id),0))<=now() THEN 'Completed' ELSE 'Upcoming' END) $$;
CREATE FUNCTION travelbuddy_private.bookings() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(travelbuddy_private.booking_data(b) ORDER BY b.created_at DESC,b.id),'[]') INTO result FROM travelbuddy_backend.scheduled_bookings b JOIN travelbuddy_backend.booking_orders o ON o.id=b.order_id WHERE o.traveler_id=(a->>'id')::uuid;
 RETURN result;
END $$;

CREATE FUNCTION travelbuddy_private.checkout(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); owner uuid:=(a->>'id')::uuid; key uuid:=(input->>'idempotencyKey')::uuid;
 order_row travelbuddy_backend.booking_orders; pack travelbuddy_backend.packages; item jsonb; order_id uuid; cap int; used int; result jsonb:='[]'; booking travelbuddy_backend.scheduled_bookings; canonical text; fingerprint text;
BEGIN
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete your account before booking.' USING ERRCODE='42501'; END IF;
 IF key IS NULL OR input->>'travelerName' IS NULL OR length(trim(input->>'travelerName')) NOT BETWEEN 2 AND 120 OR coalesce(input->>'travelerEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(input->>'travelerEmail')>320 OR jsonb_typeof(input->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Enter valid booking details.'; END IF;
 IF jsonb_array_length(input->'items') NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(input->'items') x)<>jsonb_array_length(input->'items') THEN RAISE EXCEPTION 'Choose between 1 and 20 unique booking items.'; END IF;
 -- Exactly reproduce the original Zod/JSON.stringify checkout fingerprint.
 SELECT '{"travelerName":'||to_json(trim(input->>'travelerName'))::text||',"travelerEmail":'||to_json(trim(input->>'travelerEmail'))::text||',"items":['||string_agg('{"id":'||to_json((x->>'id')::uuid::text)::text||',"experienceId":'||to_json(x->>'experienceId')::text||',"option":'||((x->>'option')::int)::text||',"date":'||to_json(x->>'date')::text||',"time":'||to_json(x->>'time')::text||',"travelers":'||((x->>'travelers')::int)::text||'}',',' ORDER BY n)||']}' INTO canonical FROM jsonb_array_elements(input->'items') WITH ORDINALITY t(x,n);
 IF canonical IS NULL THEN RAISE EXCEPTION 'Incomplete booking item.'; END IF;
 fingerprint:=encode(extensions.digest(canonical,'sha256'),'hex');
 -- Serialize duplicate keys even when retries contain different package sets.
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||key::text,0));
 PERFORM p.id FROM travelbuddy_backend.packages p WHERE p.id IN (SELECT x->>'experienceId' FROM jsonb_array_elements(input->'items') x) ORDER BY p.id FOR UPDATE;
 SELECT * INTO order_row FROM travelbuddy_backend.booking_orders o WHERE o.traveler_id=owner AND o.idempotency_key=key;
 IF FOUND THEN
 IF order_row.fingerprint<>fingerprint THEN RAISE EXCEPTION 'This checkout attempt has different details. Start a new checkout.' USING ERRCODE='23505'; END IF;
 SELECT jsonb_agg(travelbuddy_private.booking_data(b) ORDER BY b.id) INTO result FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=order_row.id; RETURN result;
 END IF;
 order_id:=gen_random_uuid();
 INSERT INTO travelbuddy_backend.booking_orders(id,traveler_id,idempotency_key,fingerprint) VALUES(order_id,owner,key,fingerprint);
 FOR item IN SELECT x FROM jsonb_array_elements(input->'items') x LOOP
 IF item->>'date' IS NULL OR item->>'time' IS NULL OR item->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR item->>'option' IS NULL OR (item->>'option')::int NOT BETWEEN 0 AND 7 OR item->>'travelers' IS NULL OR (item->>'travelers')::int NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid booking selection.'; END IF;
 PERFORM travelbuddy_private.package_detail(item->>'experienceId');
 SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id=item->>'experienceId';
 IF pack.owner_id=owner THEN RAISE EXCEPTION 'You cannot book your own package.'; END IF;
 SELECT s.capacity INTO cap FROM travelbuddy_private.slots(pack,(item->>'date')::date,(item->>'option')::int) s WHERE s.slot_time=item->>'time';
 IF cap IS NULL THEN RAISE EXCEPTION 'That date or start time is unavailable. Choose another time.' USING ERRCODE='P0001'; END IF;
 SELECT coalesce(sum(b.travelers),0) INTO used FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.date=(item->>'date')::date AND b.option_index=(item->>'option')::int AND b.time=item->>'time' AND b.status='confirmed';
 IF used+(item->>'travelers')::int>cap THEN RAISE EXCEPTION 'Not enough places remain. Choose another time.'; END IF;
 INSERT INTO travelbuddy_backend.scheduled_bookings(id,order_id,package_id,option_index,date,time,travelers,total,traveler_name,traveler_email,snapshot)
 VALUES(gen_random_uuid(),order_id,pack.id,(item->>'option')::int,(item->>'date')::date,item->>'time',(item->>'travelers')::int,round((pack.data->'options'->(item->>'option')::int->>'price')::numeric*100)/100*(item->>'travelers')::int,trim(input->>'travelerName'),trim(input->>'travelerEmail'),pack.data) RETURNING * INTO booking;
 result:=result||jsonb_build_array(travelbuddy_private.booking_data(booking));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.cancel_booking(booking_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); b travelbuddy_backend.scheduled_bookings;
BEGIN
 SELECT sb.* INTO b FROM travelbuddy_backend.scheduled_bookings sb JOIN travelbuddy_backend.booking_orders o ON o.id=sb.order_id WHERE sb.id=booking_id AND o.traveler_id=(a->>'id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.' USING ERRCODE='42501'; END IF;
 PERFORM p.id FROM travelbuddy_backend.packages p WHERE p.id=b.package_id FOR UPDATE;
 SELECT * INTO b FROM travelbuddy_backend.scheduled_bookings sb WHERE sb.id=booking_id;
 IF b.status='cancelled' THEN RETURN travelbuddy_private.booking_data(b); END IF;
 IF NOT coalesce((b.snapshot->>'freeCancellation')::boolean,false) OR ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')-now()<interval '24 hours' THEN RAISE EXCEPTION 'This booking is outside its free cancellation period.'; END IF;
 UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE id=booking_id RETURNING * INTO b;
 RETURN travelbuddy_private.booking_data(b);
END $$;
CREATE FUNCTION travelbuddy_private.start_chat(package_id text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); pack travelbuddy_backend.packages; host jsonb; result uuid; one uuid; two uuid;
BEGIN
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete your account to chat.' USING ERRCODE='42501'; END IF;
 PERFORM travelbuddy_private.package_detail(package_id);
 SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id=package_id FOR UPDATE;
 SELECT data INTO host FROM travelbuddy_backend.accounts WHERE id=pack.owner_id;
 IF pack.owner_id IS NULL OR pack.owner_id=(a->>'id')::uuid OR host->>'status'<>'active' OR host->>'onboarding'<>'completed' OR NOT (host->'roles' ?| ARRAY['provider','guide']) THEN RAISE EXCEPTION 'This provider is unavailable for chat.'; END IF;
 one:=least((a->>'id')::uuid,pack.owner_id); two:=greatest((a->>'id')::uuid,pack.owner_id);
 INSERT INTO travelbuddy_backend.conversations(id,participant_one_id,participant_two_id,context_key,package_id,updated_at)
 VALUES(gen_random_uuid(),one,two,'package:'||package_id,package_id,now())
 ON CONFLICT (participant_one_id,participant_two_id,context_key) DO UPDATE SET context_key=excluded.context_key RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.conversations() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(row_data ORDER BY updated_at DESC),'[]') INTO result FROM (
 SELECT c.updated_at,jsonb_build_object('id',c.id,'packageId',c.package_id,'packageTitle',p.title,'name',other.data->>'displayName','updatedAt',c.updated_at,'preview',(SELECT body FROM travelbuddy_backend.messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)) row_data
 FROM travelbuddy_backend.conversations c JOIN travelbuddy_backend.accounts other ON other.id=CASE WHEN c.participant_one_id=(a->>'id')::uuid THEN c.participant_two_id ELSE c.participant_one_id END LEFT JOIN travelbuddy_backend.packages p ON p.id=c.package_id
 WHERE (a->>'id')::uuid IN (c.participant_one_id,c.participant_two_id) ORDER BY c.updated_at DESC,c.id LIMIT 50) rows;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.messages(conversation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.conversations c WHERE c.id=conversation_id AND (a->>'id')::uuid IN(c.participant_one_id,c.participant_two_id)) THEN RAISE EXCEPTION 'Conversation not found.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY created_at,id),'[]') INTO result FROM (SELECT m.id,m.created_at,jsonb_build_object('id',m.id,'senderId',m.sender_id,'body',m.body,'package',m.package,'createdAt',m.created_at) row_data FROM travelbuddy_backend.messages m WHERE m.conversation_id=messages.conversation_id ORDER BY m.created_at DESC,m.id DESC LIMIT 100) rows;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.send_message(conversation_id uuid, body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); c travelbuddy_backend.conversations; recipient uuid; result uuid;
BEGIN
 IF body IS NULL OR length(trim(body)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Write a message of 1 to 1000 characters.'; END IF;
 SELECT * INTO c FROM travelbuddy_backend.conversations x WHERE x.id=conversation_id AND (a->>'id')::uuid IN(x.participant_one_id,x.participant_two_id) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found.' USING ERRCODE='42501'; END IF;
 recipient:=CASE WHEN c.participant_one_id=(a->>'id')::uuid THEN c.participant_two_id ELSE c.participant_one_id END;
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.accounts WHERE id=recipient AND data->>'status'='active') THEN RAISE EXCEPTION 'This recipient is unavailable.' USING ERRCODE='42501'; END IF;
 result:=gen_random_uuid();
 INSERT INTO travelbuddy_backend.messages(id,conversation_id,sender_id,recipient_id,body) VALUES(result,c.id,(a->>'id')::uuid,recipient,trim(body));
 UPDATE travelbuddy_backend.conversations SET updated_at=now() WHERE id=c.id;
 RETURN result;
END $$;
-- Returns only an authorized object path. Signing occurs server-side in the Edge Function.
CREATE FUNCTION travelbuddy_private.media_path(media_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE asset travelbuddy_backend.media_assets; account_id uuid; result text;
BEGIN
 SELECT id INTO account_id FROM travelbuddy_backend.accounts WHERE supabase_user_id=auth.uid() AND data->>'status'='active';
 SELECT * INTO asset FROM travelbuddy_backend.media_assets WHERE id=media_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Media not found.' USING ERRCODE='42501'; END IF;
 IF asset.owner_id=account_id
 OR EXISTS(SELECT 1 FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active') AND (p.data->'gallery' ? ('/api/media/'||media_id::text) OR p.data->'videoIds' ? media_id::text))
 OR EXISTS(SELECT 1 FROM travelbuddy_backend.accounts a WHERE a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ? 'provider' AND (a.data->>'avatarMediaId'=media_id::text OR a.data->'profileVideoIds' ? media_id::text))
 OR EXISTS(SELECT 1 FROM travelbuddy_backend.scheduled_bookings b JOIN travelbuddy_backend.booking_orders o ON o.id=b.order_id WHERE o.traveler_id=account_id AND (b.snapshot->'gallery' ? ('/api/media/'||media_id::text) OR b.snapshot->'videoIds' ? media_id::text))
 THEN RETURN asset.storage_path; END IF;
 RAISE EXCEPTION 'Media not found.' USING ERRCODE='42501';
END $$;

CREATE FUNCTION travelbuddy_api.account() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.account() $$;
REVOKE ALL ON FUNCTION travelbuddy_api.account() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.account(), travelbuddy_private.account() TO authenticated;

CREATE FUNCTION travelbuddy_api.onboard(display_name text, account_type text, expected_revision int) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.onboard(display_name, account_type, expected_revision) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.onboard(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.onboard(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.onboard(text, text, int), travelbuddy_private.onboard(text, text, int) TO authenticated;

CREATE FUNCTION travelbuddy_api.catalog(filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.catalog(filters) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.catalog(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.catalog(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.catalog(jsonb), travelbuddy_private.catalog(jsonb) TO anon, authenticated;

CREATE FUNCTION travelbuddy_api.package_detail(package_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.package_detail(package_id) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.package_detail(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.package_detail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.package_detail(text), travelbuddy_private.package_detail(text) TO anon, authenticated;

CREATE FUNCTION travelbuddy_api.availability(package_id text, day date, option_index int DEFAULT 0, travelers int DEFAULT 1) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.availability(package_id, day, option_index, travelers) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.availability(text, date, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.availability(text, date, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.availability(text, date, int, int), travelbuddy_private.availability(text, date, int, int) TO anon, authenticated;

CREATE FUNCTION travelbuddy_api.bookings() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.bookings() $$;
REVOKE ALL ON FUNCTION travelbuddy_api.bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.bookings(), travelbuddy_private.bookings() TO authenticated;

CREATE FUNCTION travelbuddy_api.checkout(input jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.checkout(input) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.checkout(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.checkout(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.checkout(jsonb), travelbuddy_private.checkout(jsonb) TO authenticated;

CREATE FUNCTION travelbuddy_api.cancel_booking(booking_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.cancel_booking(booking_id) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.cancel_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.cancel_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.cancel_booking(uuid), travelbuddy_private.cancel_booking(uuid) TO authenticated;

CREATE FUNCTION travelbuddy_api.start_chat(package_id text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.start_chat(package_id) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.start_chat(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.start_chat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.start_chat(text), travelbuddy_private.start_chat(text) TO authenticated;

CREATE FUNCTION travelbuddy_api.conversations() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.conversations() $$;
REVOKE ALL ON FUNCTION travelbuddy_api.conversations() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.conversations(), travelbuddy_private.conversations() TO authenticated;

CREATE FUNCTION travelbuddy_api.messages(conversation_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.messages(conversation_id) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.messages(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.messages(uuid), travelbuddy_private.messages(uuid) TO authenticated;

CREATE FUNCTION travelbuddy_api.send_message(conversation_id uuid, body text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.send_message(conversation_id, body) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.send_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.send_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.send_message(uuid, text), travelbuddy_private.send_message(uuid, text) TO authenticated;

CREATE FUNCTION travelbuddy_api.media_path(media_id uuid) RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.media_path(media_id) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.media_path(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.media_path(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.media_path(uuid), travelbuddy_private.media_path(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION travelbuddy_private.slots(travelbuddy_backend.packages,date,int), travelbuddy_private.package_data(jsonb), travelbuddy_private.booking_data(travelbuddy_backend.scheduled_bookings) FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
