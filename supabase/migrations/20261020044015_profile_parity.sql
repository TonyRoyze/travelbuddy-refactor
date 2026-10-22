-- Keep legacy JSON profile fields and media references; never replace account data wholesale.
CREATE FUNCTION travelbuddy_private.profile_fields(raw jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('bio',coalesce(raw->>'bio',''),'homeBase',coalesce(raw->>'homeBase',''),'languages',coalesce(raw->>'languages',''),
 'interests',coalesce(raw->>'interests',''),'travelStyle',coalesce(raw->>'travelStyle',''),'specialties',coalesce(raw->>'specialties',''),'yearsExperience',raw->'yearsExperience');
$$;
CREATE OR REPLACE FUNCTION travelbuddy_private.account() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a travelbuddy_backend.accounts; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to continue.' USING ERRCODE='42501'; END IF;
 INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at)
 VALUES(gen_random_uuid(),uid,'{"displayName":"Traveler","roles":["traveler"],"status":"active","onboarding":"pending","avatarMediaId":null,"profileVideoIds":[],"profileDetails":{"bio":"","homeBase":"","languages":"","interests":"","travelStyle":"","specialties":"","yearsExperience":null}}',now())
 ON CONFLICT(supabase_user_id) DO NOTHING;
 SELECT * INTO a FROM travelbuddy_backend.accounts WHERE supabase_user_id=uid;
 IF a.schema_version<>1 OR a.data->>'status'<>'active' THEN RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',a.id,'displayName',a.data->>'displayName','roles',a.data->'roles','onboarding',a.data->>'onboarding','revision',a.revision,'email',auth.jwt()->>'email',
 'profileDetails',travelbuddy_private.profile_fields(a.data->'profileDetails'),'avatarMediaId',a.data->'avatarMediaId','profileVideoIds',coalesce(a.data->'profileVideoIds','[]'));
END $$;
CREATE FUNCTION travelbuddy_private.save_profile(input jsonb,expected_revision int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); details jsonb; key text; max_length int; cleaned jsonb:='{}'; years int;
BEGIN
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete registration first.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input-ARRAY['displayName','profileDetails']<>'{}' OR jsonb_typeof(input->'displayName') IS DISTINCT FROM 'string' OR length(trim(input->>'displayName')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(input->'profileDetails') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Check your profile details.'; END IF;
 details:=input->'profileDetails';
 IF details-ARRAY['bio','homeBase','languages','interests','travelStyle','specialties','yearsExperience']<>'{}' THEN RAISE EXCEPTION 'Unknown profile fields.'; END IF;
 FOREACH key IN ARRAY ARRAY['bio','homeBase','languages','interests','travelStyle','specialties'] LOOP
 max_length:=CASE key WHEN 'bio' THEN 500 WHEN 'languages' THEN 160 WHEN 'interests' THEN 240 WHEN 'specialties' THEN 240 ELSE 120 END;
 IF jsonb_typeof(details->key) IS DISTINCT FROM 'string' OR length(trim(details->>key))>max_length THEN RAISE EXCEPTION 'Check the length and format of your profile details.'; END IF;
 cleaned:=cleaned||jsonb_build_object(key,trim(details->>key));
 END LOOP;
 IF details->'yearsExperience' IS DISTINCT FROM 'null'::jsonb THEN
 IF jsonb_typeof(details->'yearsExperience') IS DISTINCT FROM 'number' OR (details->>'yearsExperience')::numeric<>trunc((details->>'yearsExperience')::numeric) THEN RAISE EXCEPTION 'Enter whole years of experience.'; END IF;
 years:=(details->>'yearsExperience')::int; IF years NOT BETWEEN 0 AND 80 THEN RAISE EXCEPTION 'Enter between 0 and 80 years of experience.'; END IF;
 END IF;
 cleaned:=cleaned||jsonb_build_object('yearsExperience',years);
 UPDATE travelbuddy_backend.accounts SET data=data||jsonb_build_object('displayName',trim(input->>'displayName'),'profileDetails',cleaned),revision=revision+1,updated_at=clock_timestamp()
 WHERE id=(a->>'id')::uuid AND revision=expected_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Your profile changed. Reload it before saving again.' USING ERRCODE='40001'; END IF;
 RETURN travelbuddy_private.account();
END $$;
CREATE FUNCTION travelbuddy_private.set_profile_media(input jsonb,expected_revision int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); ids jsonb; patch jsonb; total int;
BEGIN
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete registration first.' USING ERRCODE='42501'; END IF;
 IF input->>'kind'='photo' THEN
 IF input-ARRAY['kind','id']<>'{}' THEN RAISE EXCEPTION 'Invalid photo details.'; END IF;
 IF input->>'id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM travelbuddy_backend.media_assets m WHERE m.id=(input->>'id')::uuid AND m.owner_id=(a->>'id')::uuid AND m.mime_type IN ('image/jpeg','image/png','image/webp') AND m.bytes<=5242880) THEN RAISE EXCEPTION 'Choose a photo uploaded to your own account.' USING ERRCODE='42501'; END IF;
 patch:=jsonb_build_object('avatarMediaId',input->'id');
 ELSIF input->>'kind'='videos' THEN
 IF NOT (a->'roles' ?| ARRAY['provider','guide']) THEN RAISE EXCEPTION 'Only buddies and guides can publish introduction videos.' USING ERRCODE='42501'; END IF;
 ids:=input->'ids';
 IF input-ARRAY['kind','ids']<>'{}' OR jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose up to three unique video clips.'; END IF;
 total:=jsonb_array_length(ids);
 IF total>3 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(ids))<>total THEN RAISE EXCEPTION 'Choose up to three unique video clips.'; END IF;
 IF (SELECT count(*) FROM travelbuddy_backend.media_assets m WHERE m.id IN (SELECT value::uuid FROM jsonb_array_elements_text(ids)) AND m.owner_id=(a->>'id')::uuid AND m.mime_type IN ('video/mp4','video/webm') AND m.duration_seconds>0 AND m.duration_seconds<=60 AND m.bytes<=26214400)<>total THEN RAISE EXCEPTION 'Choose valid clips uploaded to your own account.' USING ERRCODE='42501'; END IF;
 patch:=jsonb_build_object('profileVideoIds',ids);
 ELSE RAISE EXCEPTION 'Choose a photo or video update.'; END IF;
 UPDATE travelbuddy_backend.accounts SET data=data||patch,revision=revision+1,updated_at=clock_timestamp() WHERE id=(a->>'id')::uuid AND revision=expected_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Your profile changed. Reload it before saving again.' USING ERRCODE='40001'; END IF;
 RETURN travelbuddy_private.account();
END $$;
-- Only the trusted validation service may register a freshly inspected upload.
CREATE FUNCTION travelbuddy_private.commit_profile_upload(actor_id uuid,input jsonb,expected_revision int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a travelbuddy_backend.accounts; media_id uuid:=(input->>'id')::uuid; mime text:=input->>'mimeType'; path text:=input->>'path'; size int:=(input->>'bytes')::int; duration double precision:=(input->>'duration')::double precision; extension text; patch jsonb;
BEGIN
 SELECT * INTO a FROM travelbuddy_backend.accounts WHERE supabase_user_id=actor_id FOR UPDATE;
 IF NOT FOUND OR a.schema_version<>1 OR a.data->>'status'<>'active' OR a.data->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE='42501'; END IF;
 IF a.revision<>expected_revision THEN RAISE EXCEPTION 'Your profile changed. Reload it before uploading again.' USING ERRCODE='40001'; END IF;
 extension:=CASE mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'video/mp4' THEN 'mp4' WHEN 'video/webm' THEN 'webm' ELSE NULL END;
 IF media_id IS NULL OR extension IS NULL OR path IS DISTINCT FROM a.id::text||'/'||media_id::text||'.'||extension OR size IS NULL OR size<=0 THEN RAISE EXCEPTION 'Invalid media metadata.'; END IF;
 IF mime LIKE 'image/%' THEN
 IF size>5242880 OR duration IS NOT NULL THEN RAISE EXCEPTION 'Photos must be 5 MB or smaller.'; END IF;
 patch:=jsonb_build_object('avatarMediaId',media_id);
 ELSE
 IF NOT(a.data->'roles' ?| ARRAY['provider','guide']) THEN RAISE EXCEPTION 'A buddy or guide account is required.' USING ERRCODE='42501'; END IF;
 IF size>26214400 OR duration IS NULL OR NOT(duration>0 AND duration<=60) OR jsonb_array_length(coalesce(a.data->'profileVideoIds','[]'))>=3 THEN RAISE EXCEPTION 'Use up to three clips, 60 seconds and 25 MB each.'; END IF;
 patch:=jsonb_build_object('profileVideoIds',coalesce(a.data->'profileVideoIds','[]')||jsonb_build_array(media_id));
 END IF;
 INSERT INTO travelbuddy_backend.media_assets(id,owner_id,storage_path,mime_type,bytes,duration_seconds) VALUES(media_id,a.id,path,mime,size,duration);
 UPDATE travelbuddy_backend.accounts SET data=data||patch,revision=revision+1,updated_at=clock_timestamp() WHERE id=a.id;
 RETURN media_id;
END $$;
CREATE FUNCTION travelbuddy_private.buddy_profile(profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a travelbuddy_backend.accounts; packages jsonb; details jsonb;
BEGIN
 SELECT * INTO a FROM travelbuddy_backend.accounts WHERE id=profile_id AND schema_version=1 AND data->>'status'='active' AND data->>'onboarding'='completed' AND data->'roles' ?| ARRAY['provider','guide'];
 IF NOT FOUND THEN RAISE EXCEPTION 'Buddy profile not found.' USING ERRCODE='P0002'; END IF;
 details:=travelbuddy_private.profile_fields(a.data->'profileDetails')-ARRAY['interests','travelStyle'];
 SELECT coalesce(jsonb_agg(travelbuddy_private.package_data(p.data) ORDER BY p.updated_at DESC,p.id),'[]') INTO packages FROM (SELECT * FROM travelbuddy_backend.packages WHERE owner_id=a.id AND published ORDER BY updated_at DESC,id LIMIT 100) p;
 RETURN jsonb_build_object('id',a.id,'displayName',a.data->>'displayName','avatarMediaId',a.data->'avatarMediaId','profileVideoIds',coalesce(a.data->'profileVideoIds','[]'),'profileDetails',details,'packages',packages);
END $$;
CREATE FUNCTION travelbuddy_api.save_profile(input jsonb,expected_revision int) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.save_profile(input,expected_revision) $$;
CREATE FUNCTION travelbuddy_api.set_profile_media(input jsonb,expected_revision int) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.set_profile_media(input,expected_revision) $$;
CREATE FUNCTION travelbuddy_api.commit_profile_upload(actor_id uuid,input jsonb,expected_revision int) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.commit_profile_upload(actor_id,input,expected_revision) $$;
CREATE FUNCTION travelbuddy_api.buddy_profile(profile_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT travelbuddy_private.buddy_profile(profile_id) $$;
GRANT INSERT ON travelbuddy_backend.media_assets TO travelbuddy_api_executor;
GRANT CREATE ON SCHEMA travelbuddy_private TO travelbuddy_api_executor;
DO $$ DECLARE sig text; BEGIN FOREACH sig IN ARRAY ARRAY['profile_fields(jsonb)','save_profile(jsonb,int)','set_profile_media(jsonb,int)','commit_profile_upload(uuid,jsonb,int)','buddy_profile(uuid)'] LOOP
 EXECUTE 'ALTER FUNCTION travelbuddy_private.'||sig||' OWNER TO travelbuddy_api_executor';
 EXECUTE 'REVOKE ALL ON FUNCTION travelbuddy_private.'||sig||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP; END $$;
REVOKE CREATE ON SCHEMA travelbuddy_private FROM travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_api.save_profile(jsonb,int),travelbuddy_api.set_profile_media(jsonb,int),travelbuddy_api.commit_profile_upload(uuid,jsonb,int),travelbuddy_api.buddy_profile(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION travelbuddy_api.save_profile(jsonb,int),travelbuddy_api.set_profile_media(jsonb,int),travelbuddy_private.save_profile(jsonb,int),travelbuddy_private.set_profile_media(jsonb,int) TO authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_api.buddy_profile(uuid),travelbuddy_private.buddy_profile(uuid) TO anon,authenticated;
GRANT USAGE ON SCHEMA travelbuddy_api,travelbuddy_private TO service_role;
GRANT EXECUTE ON FUNCTION travelbuddy_api.commit_profile_upload(uuid,jsonb,int),travelbuddy_private.commit_profile_upload(uuid,jsonb,int) TO service_role;
CREATE OR REPLACE FUNCTION travelbuddy_private.media_path(media_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE asset travelbuddy_backend.media_assets; account_id uuid; result text;
BEGIN
 SELECT id INTO account_id FROM travelbuddy_backend.accounts WHERE supabase_user_id=auth.uid() AND data->>'status'='active';
 SELECT * INTO asset FROM travelbuddy_backend.media_assets WHERE id=media_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Media not found.' USING ERRCODE='42501'; END IF;
 IF asset.owner_id=account_id
 OR EXISTS(SELECT 1 FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id WHERE p.published AND (p.owner_id IS NULL OR a.data->>'status'='active') AND (p.data->'gallery' ? ('/api/media/'||media_id::text) OR p.data->'videoIds' ? media_id::text))
 OR EXISTS(SELECT 1 FROM travelbuddy_backend.accounts a WHERE a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide'] AND (a.data->>'avatarMediaId'=media_id::text OR a.data->'profileVideoIds' ? media_id::text))
 OR EXISTS(SELECT 1 FROM travelbuddy_backend.scheduled_bookings b JOIN travelbuddy_backend.booking_orders o ON o.id=b.order_id WHERE o.traveler_id=account_id AND (b.snapshot->'gallery' ? ('/api/media/'||media_id::text) OR b.snapshot->'videoIds' ? media_id::text))
 THEN RETURN asset.storage_path; END IF;
 RAISE EXCEPTION 'Media not found.' USING ERRCODE='42501';
END $$;


CREATE OR REPLACE FUNCTION travelbuddy_private.package_detail(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 SELECT travelbuddy_private.package_data(p.data)||jsonb_build_object('providerId',p.owner_id,'canChat',coalesce(a.schema_version=1 AND a.data->>'status'='active' AND a.data->>'onboarding'='completed' AND a.data->'roles' ?| ARRAY['provider','guide'] AND a.supabase_user_id IS DISTINCT FROM auth.uid(),false))
 INTO result FROM travelbuddy_backend.packages p LEFT JOIN travelbuddy_backend.accounts a ON a.id=p.owner_id
 WHERE p.id=package_id AND p.published AND(p.owner_id IS NULL OR a.data->>'status'='active');
 IF result IS NULL THEN RAISE EXCEPTION 'Experience not found.' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
