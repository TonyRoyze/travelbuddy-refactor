-- Buddy-only authoring. Published reads and historical booking snapshots stay compatible.
CREATE FUNCTION travelbuddy_private.editor_text(value jsonb,label text,minimum int,maximum int) RETURNS text
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(trim(value#>>'{}')) NOT BETWEEN minimum AND maximum THEN RAISE EXCEPTION 'Check % (between % and % characters).',label,minimum,maximum; END IF;
 RETURN trim(value#>>'{}');
END $$;
CREATE FUNCTION travelbuddy_private.editor_array(value jsonb,label text,minimum int,maximum int) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Check %.',label; END IF;
 IF jsonb_array_length(value) NOT BETWEEN minimum AND maximum THEN RAISE EXCEPTION 'Check the number of %.',label; END IF;
 RETURN value;
END $$;
CREATE FUNCTION travelbuddy_private.editor_number(value jsonb,label text,minimum numeric,maximum numeric,whole boolean DEFAULT false) RETURNS numeric
LANGUAGE plpgsql SET search_path='' AS $$
<<vars>>
DECLARE n numeric;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Check %.',label; END IF;
 n:=(value#>>'{}')::numeric;
 IF n NOT BETWEEN minimum AND maximum OR (whole AND n<>trunc(n)) THEN RAISE EXCEPTION 'Check %.',label; END IF;
 RETURN n;
END $$;
CREATE FUNCTION travelbuddy_private.editor_strings(value jsonb,label text,minimum int,maximum int,item_min int,item_max int) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
<<vars>>
DECLARE result jsonb:='[]'; item jsonb;
BEGIN
 FOR item IN SELECT v FROM jsonb_array_elements(travelbuddy_private.editor_array(value,label,minimum,maximum)) v LOOP
 result:=result||jsonb_build_array(travelbuddy_private.editor_text(item,label,item_min,item_max));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.editor_schedule(raw jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
<<vars>>
DECLARE first_day date; last_day date; item jsonb; day_value jsonb; day_date date;
BEGIN
 IF jsonb_typeof(raw) IS DISTINCT FROM 'object' OR raw-ARRAY['startDate','endDate','weekdays','exceptions']<>'{}' THEN RAISE EXCEPTION 'Check operating schedule.'; END IF;
 first_day:=travelbuddy_private.editor_text(raw->'startDate','first operating date',10,10)::date;
 last_day:=travelbuddy_private.editor_text(raw->'endDate','last operating date',10,10)::date;
 IF first_day::text<>raw->>'startDate' OR last_day::text<>raw->>'endDate' OR last_day<first_day OR last_day>first_day+730 THEN RAISE EXCEPTION 'Choose an operating range of up to two years.'; END IF;
 FOR day_value IN SELECT v FROM jsonb_array_elements(travelbuddy_private.editor_array(raw->'weekdays','weekdays',0,7)) v LOOP
 PERFORM travelbuddy_private.editor_number(day_value,'operating day',0,6,true);
 END LOOP;
 IF (SELECT count(DISTINCT v) FROM jsonb_array_elements(raw->'weekdays') v)<>jsonb_array_length(raw->'weekdays') THEN RAISE EXCEPTION 'Use unique operating days.'; END IF;
 FOR item IN SELECT v FROM jsonb_array_elements(travelbuddy_private.editor_array(raw->'exceptions','date changes',0,366)) v LOOP
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['date','closed','capacity','times']<>'{}' OR jsonb_typeof(item->'closed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Check date-specific changes.'; END IF;
 day_date:=travelbuddy_private.editor_text(item->'date','exception date',10,10)::date;
 IF day_date::text<>item->>'date' THEN RAISE EXCEPTION 'Choose a valid exception date.'; END IF;
 IF item ? 'capacity' THEN PERFORM travelbuddy_private.editor_number(item->'capacity','special capacity',1,12,true); END IF;
 IF item ? 'times' THEN
 PERFORM travelbuddy_private.editor_strings(item->'times','special times',1,24,5,5);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'times') t WHERE t!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'Use 24-hour start times.'; END IF;
 END IF;
 END LOOP;
 IF (SELECT count(DISTINCT v->>'date') FROM jsonb_array_elements(raw->'exceptions') v)<>jsonb_array_length(raw->'exceptions') THEN RAISE EXCEPTION 'Use one change per date.'; END IF;
 RETURN raw;
END $$;
CREATE FUNCTION travelbuddy_private.editor_package(pack travelbuddy_backend.packages) RETURNS jsonb
LANGUAGE sql SET search_path='' AS $$
 SELECT jsonb_build_object('id',pack.id,'revision',pack.revision,'updatedAt',pack.updated_at,'input',
 jsonb_build_object('title',pack.title,'destination',pack.destination,'country',pack.country,'category',pack.category,'description',pack.data->>'description','durationMinutes',pack.duration_minutes,'languages',pack.data->'languages',
 'imageIds',coalesce((SELECT jsonb_agg(CASE WHEN v LIKE '/api/media/%' THEN substring(v FROM 12) ELSE v END) FROM jsonb_array_elements_text(pack.data->'gallery') v),'[]'),
 'videoIds',coalesce(pack.data->'videoIds','[]'),'highlights',pack.data->'highlights','included',pack.data->'included','notIncluded',pack.data->'notIncluded','meetingPoint',pack.data->>'meetingPoint',
 'freeCancellation',pack.free_cancellation,'pickup',coalesce((pack.data->>'pickup')::boolean,false),'options',(SELECT jsonb_agg(jsonb_build_object('name',v->>'name','price',v->'price','capacity',coalesce(v->'capacity','12'),'times',v->'times')) FROM jsonb_array_elements(pack.data->'options') v),
 'itinerary',pack.data->'itinerary','published',pack.published,'revision',pack.revision,
 'schedule',CASE WHEN pack.schedule='{}' THEN jsonb_build_object('startDate',(now() AT TIME ZONE 'Asia/Colombo')::date,'endDate',(now() AT TIME ZONE 'Asia/Colombo')::date+180,'weekdays',jsonb_build_array(1,2,3,4,5,6),'exceptions','[]'::jsonb) ELSE pack.schedule END));
$$;
CREATE FUNCTION travelbuddy_private.buddy_packages() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<vars>>
DECLARE owner_id uuid:=travelbuddy_private.require_discovery_provider(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(travelbuddy_private.editor_package(p) ORDER BY p.updated_at DESC,p.id),'[]') INTO result FROM (SELECT * FROM travelbuddy_backend.packages p WHERE p.owner_id=vars.owner_id ORDER BY updated_at DESC,id LIMIT 100) p;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.buddy_package(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<vars>>
DECLARE owner_id uuid:=travelbuddy_private.require_discovery_provider(); pack travelbuddy_backend.packages;
BEGIN
 SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id=package_id AND p.owner_id=vars.owner_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Package not found.' USING ERRCODE='42501'; END IF;
 RETURN travelbuddy_private.editor_package(pack);
END $$;
CREATE FUNCTION travelbuddy_private.package_reservations(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<vars>>
DECLARE result jsonb;
BEGIN
 PERFORM travelbuddy_private.buddy_package(package_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',date,'time',time,'option',option_index,'travelers',places) ORDER BY date,time,option_index),'[]') INTO result FROM (
 SELECT b.date,b.time,b.option_index,sum(b.travelers) places FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=package_reservations.package_id AND b.status='confirmed' AND b.date>=(now() AT TIME ZONE 'Asia/Colombo')::date GROUP BY b.date,b.time,b.option_index ORDER BY b.date,b.time,b.option_index LIMIT 1000) rows;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.save_buddy_package(input jsonb,package_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<vars>>
DECLARE owner_id uuid:=travelbuddy_private.require_discovery_provider(); previous travelbuddy_backend.packages; next_pack travelbuddy_backend.packages;
 title text; destination text; country text; category text; description text; meeting text; duration_minutes int; duration text; minimum_price numeric;
 images jsonb:='[]'; clips jsonb; options jsonb:='[]'; itinerary jsonb:='[]'; languages jsonb; highlights jsonb; included jsonb; not_included jsonb; schedule jsonb; doc jsonb; published boolean; pickup boolean; free_cancel boolean;
 item jsonb; ref text; media_id uuid; option_name text; times jsonb; opt_capacity int; price numeric; reserved record; capacity int;
BEGIN
 -- Serialize package creation limits and ownership changes, then share the package
 -- row lock used by checkout and cancellation before inspecting reservations.
 PERFORM pg_advisory_xact_lock(hashtextextended('buddy-package:'||owner_id::text,0));
 IF package_id IS NOT NULL THEN
 SELECT * INTO previous FROM travelbuddy_backend.packages p WHERE p.id=package_id AND p.owner_id=vars.owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Package not found.' USING ERRCODE='42501'; END IF;
 IF (input->>'revision')::int IS DISTINCT FROM previous.revision THEN RAISE EXCEPTION 'This package changed. Reload before saving.' USING ERRCODE='PT409'; END IF;
 ELSE
 IF (SELECT count(*) FROM travelbuddy_backend.packages p WHERE p.owner_id=vars.owner_id)>=100 THEN RAISE EXCEPTION 'You can keep up to 100 packages.'; END IF;
 END IF;
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input-ARRAY['title','schedule','destination','country','category','description','durationMinutes','languages','imageIds','videoIds','highlights','included','notIncluded','meetingPoint','freeCancellation','pickup','options','itinerary','published','revision']<>'{}' THEN RAISE EXCEPTION 'Unknown package fields.'; END IF;
 title:=travelbuddy_private.editor_text(input->'title','title',2,200);
 destination:=travelbuddy_private.editor_text(input->'destination','destination',0,120);
 country:=travelbuddy_private.editor_text(input->'country','country',0,120);
 category:=travelbuddy_private.editor_text(input->'category','category',0,80);
 description:=travelbuddy_private.editor_text(input->'description','description',0,5000);
 meeting:=travelbuddy_private.editor_text(input->'meetingPoint','meeting point',0,500);
 duration_minutes:=travelbuddy_private.editor_number(input->'durationMinutes','duration',15,10080,true);
 duration:=CASE WHEN duration_minutes%60=0 THEN (duration_minutes/60)::text||' hours' ELSE duration_minutes::text||' minutes' END;
 IF jsonb_typeof(input->'published') IS DISTINCT FROM 'boolean' OR jsonb_typeof(input->'pickup') IS DISTINCT FROM 'boolean' OR jsonb_typeof(input->'freeCancellation') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Check publishing, pickup and cancellation choices.'; END IF;
 published:=(input->>'published')::boolean; pickup:=(input->>'pickup')::boolean; free_cancel:=(input->>'freeCancellation')::boolean;
 languages:=travelbuddy_private.editor_strings(input->'languages','languages',1,12,1,60);
 highlights:=travelbuddy_private.editor_strings(input->'highlights','highlights',0,12,0,240);
 included:=travelbuddy_private.editor_strings(input->'included','included items',0,20,0,240);
 not_included:=travelbuddy_private.editor_strings(input->'notIncluded','excluded items',0,20,0,240);
 FOR item IN SELECT v FROM jsonb_array_elements(travelbuddy_private.editor_strings(input->'imageIds','photos',0,6,1,2048)) v LOOP
 ref:=item#>>'{}';
 IF ref~'^[0-9a-fA-F-]{36}$' THEN
 media_id:=ref::uuid;
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.media_assets m WHERE m.id=media_id AND m.owner_id=vars.owner_id AND m.mime_type IN('image/jpeg','image/png','image/webp') AND m.bytes<=26214400) THEN RAISE EXCEPTION 'Choose photos uploaded to your account.' USING ERRCODE='42501'; END IF;
 images:=images||jsonb_build_array('/api/media/'||media_id::text);
 ELSIF previous.id IS NOT NULL AND previous.data->'gallery' ? ref THEN images:=images||jsonb_build_array(ref);
 ELSE RAISE EXCEPTION 'Choose photos uploaded to your account.' USING ERRCODE='42501'; END IF;
 END LOOP;
 clips:=travelbuddy_private.editor_strings(input->'videoIds','video clips',0,3,36,36);
 FOR ref IN SELECT jsonb_array_elements_text(clips) LOOP
 media_id:=ref::uuid;
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.media_assets m WHERE m.id=media_id AND m.owner_id=vars.owner_id AND m.mime_type IN('video/mp4','video/webm') AND m.bytes<=26214400 AND m.duration_seconds>0 AND m.duration_seconds<=60) THEN RAISE EXCEPTION 'Choose valid clips uploaded to your account.' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT v) FROM jsonb_array_elements(images) v)<>jsonb_array_length(images) OR (SELECT count(DISTINCT v) FROM jsonb_array_elements(clips) v)<>jsonb_array_length(clips) THEN RAISE EXCEPTION 'Choose unique photos and video clips.'; END IF;
 IF published AND (destination='' OR country='' OR category='' OR meeting='' OR length(description)<20 OR jsonb_array_length(images)=0) THEN RAISE EXCEPTION 'Complete the destination, country, category, meeting point, story and cover photo before publishing.'; END IF;
 FOR item IN SELECT v FROM jsonb_array_elements(travelbuddy_private.editor_array(input->'options','pricing options',1,8)) v LOOP
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['name','price','capacity','times']<>'{}' THEN RAISE EXCEPTION 'Check pricing options.'; END IF;
 option_name:=travelbuddy_private.editor_text(item->'name','option name',1,120);
 price:=round(travelbuddy_private.editor_number(item->'price','price',0,100000),2);
 opt_capacity:=travelbuddy_private.editor_number(item->'capacity','capacity',1,12,true);
 times:=travelbuddy_private.editor_strings(item->'times','start times',1,24,5,5);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(times) t WHERE t!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'Use 24-hour start times.'; END IF;
 options:=options||jsonb_build_array(jsonb_build_object('name',option_name,'price',price,'capacity',opt_capacity,'times',times,'duration',duration,'detail','Up to '||opt_capacity||' travellers'));
 minimum_price:=least(minimum_price,price);
 END LOOP;
 FOR item IN SELECT v FROM jsonb_array_elements(travelbuddy_private.editor_array(input->'itinerary','itinerary stops',0,20)) v LOOP
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['time','title','detail']<>'{}' THEN RAISE EXCEPTION 'Check itinerary stops.'; END IF;
 itinerary:=itinerary||jsonb_build_array(jsonb_build_object('time',travelbuddy_private.editor_text(item->'time','stop time',0,60),'title',travelbuddy_private.editor_text(item->'title','stop name',1,160),'detail',travelbuddy_private.editor_text(item->'detail','stop details',0,1000)));
 END LOOP;
 schedule:=travelbuddy_private.editor_schedule(input->'schedule');
 SELECT jsonb_build_object('id',coalesce(package_id,'buddy-'||gen_random_uuid()::text),'title',title,'destination',destination,'country',country,'category',category,'description',description,'supplier',a.data->>'displayName','image',coalesce(images->>0,'/brand/buddy-mark.svg'),'gallery',images,'videoIds',clips,'rating',coalesce(previous.data->'rating','0'),'reviews',coalesce(previous.data->'reviews','0'),'price',minimum_price,'duration',duration,'freeCancellation',free_cancel,'pickup',pickup,'payLater',false,'languages',languages,'highlights',highlights,'included',included,'notIncluded',not_included,'meetingPoint',meeting,'options',options,'itinerary',itinerary) INTO doc FROM travelbuddy_backend.accounts a WHERE a.id=owner_id;
 next_pack:=previous;next_pack.data:=doc;next_pack.schedule:=schedule;
 IF previous.id IS NOT NULL THEN
 FOR reserved IN SELECT b.date,b.time,b.option_index,sum(b.travelers) places FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=previous.id AND b.status='confirmed' AND ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')>now() GROUP BY b.date,b.time,b.option_index LOOP
 SELECT s.capacity INTO capacity FROM travelbuddy_private.slots(next_pack,reserved.date,reserved.option_index) s WHERE s.slot_time=reserved.time;
 IF options->reserved.option_index->>'name' IS DISTINCT FROM previous.data->'options'->reserved.option_index->>'name' OR capacity IS NULL OR capacity<reserved.places THEN RAISE EXCEPTION 'Confirmed bookings on % at %. Keep the option, time and enough capacity.',reserved.date,reserved.time USING ERRCODE='PT409'; END IF;
 END LOOP;
 UPDATE travelbuddy_backend.packages p SET data=doc,schedule=vars.schedule,title=vars.title,destination=vars.destination,country=vars.country,category=vars.category,price=minimum_price,duration_minutes=vars.duration_minutes,duration=vars.duration,free_cancellation=free_cancel,published=vars.published,revision=p.revision+1,updated_at=clock_timestamp() WHERE p.id=previous.id RETURNING * INTO next_pack;
 -- Editing a meeting description/destination invalidates an old discovery pin.
 DELETE FROM travelbuddy_private.meeting_points m WHERE m.package_id=previous.id AND (previous.destination IS DISTINCT FROM destination OR previous.data->>'meetingPoint' IS DISTINCT FROM meeting);
 ELSE
 INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at) VALUES(doc->>'id',owner_id,title,destination,country,category,minimum_price,0,duration_minutes,duration,free_cancel,published,doc,schedule,clock_timestamp()) RETURNING * INTO next_pack;
 END IF;
 RETURN travelbuddy_private.editor_package(next_pack);
END $$;
-- The validator service registers unattached package media; package saves enforce ownership.
CREATE FUNCTION travelbuddy_private.commit_package_upload(actor_id uuid,input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<vars>>
DECLARE owner_id uuid; id uuid:=(input->>'id')::uuid; mime text:=input->>'mimeType'; path text:=input->>'path'; size int:=(input->>'bytes')::int; duration double precision:=(input->>'duration')::double precision; extension text;
BEGIN
 SELECT a.id INTO owner_id FROM travelbuddy_backend.accounts a WHERE a.supabase_user_id=actor_id AND a.schema_version=1 AND a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide'] FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'A Buddy or Guide account is required.' USING ERRCODE='42501'; END IF;
 extension:=CASE mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'video/mp4' THEN 'mp4' WHEN 'video/webm' THEN 'webm' END;
 IF id IS NULL OR extension IS NULL OR path IS DISTINCT FROM owner_id::text||'/'||id::text||'.'||extension OR size IS NULL OR size NOT BETWEEN 1 AND 26214400 OR (mime LIKE 'video/%' AND (duration IS NULL OR NOT(duration>0 AND duration<=60))) OR (mime LIKE 'image/%' AND duration IS NOT NULL) THEN RAISE EXCEPTION 'Invalid package media metadata.'; END IF;
 INSERT INTO travelbuddy_backend.media_assets(id,owner_id,storage_path,mime_type,bytes,duration_seconds) VALUES(id,owner_id,path,mime,size,duration);
 RETURN id;
END $$;
CREATE FUNCTION travelbuddy_api.buddy_packages() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.buddy_packages()$$;
CREATE FUNCTION travelbuddy_api.buddy_package(package_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.buddy_package(package_id)$$;
CREATE FUNCTION travelbuddy_api.save_buddy_package(input jsonb,package_id text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.save_buddy_package(input,package_id)$$;
CREATE FUNCTION travelbuddy_api.package_reservations(package_id text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.package_reservations(package_id)$$;
CREATE FUNCTION travelbuddy_api.commit_package_upload(actor_id uuid,input jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.commit_package_upload(actor_id,input)$$;
GRANT INSERT,UPDATE ON travelbuddy_backend.packages TO travelbuddy_api_executor;
GRANT DELETE ON travelbuddy_private.meeting_points TO travelbuddy_api_executor;
DO $$DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('travelbuddy_private','travelbuddy_api') AND p.proname IN('editor_text','editor_array','editor_number','editor_strings','editor_schedule','editor_package','buddy_packages','buddy_package','save_buddy_package','package_reservations','commit_package_upload') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 IF f.nspname='travelbuddy_private' THEN EXECUTE format('ALTER FUNCTION %s OWNER TO travelbuddy_api_executor',f.signature); END IF;
 IF f.proname='commit_package_upload' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 ELSIF f.proname IN('buddy_packages','buddy_package','save_buddy_package','package_reservations') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
