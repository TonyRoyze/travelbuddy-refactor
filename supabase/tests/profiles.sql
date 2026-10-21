BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use the disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('91919191-9191-4191-8191-919191919191','a9191919-9191-4191-8191-919191919191','{"displayName":"Profile Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('92929292-9292-4292-8292-929292929292','b9292929-9292-4292-8292-929292929292','{"displayName":"Profile Traveler","roles":["traveler"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.media_assets(id,owner_id,storage_path,mime_type,bytes,duration_seconds) VALUES
('93939393-9393-4393-8393-939393939393','91919191-9191-4191-8191-919191919191','test/photo.png','image/png',100,null),
('94949494-9494-4494-8494-949494949494','92929292-9292-4292-8292-929292929292','test/other.png','image/png',100,null),
('95959595-9595-4595-8595-959595959595','91919191-9191-4191-8191-919191919191','test/clip.mp4','video/mp4',100,10);
SELECT set_config('request.jwt.claim.sub','a9191919-9191-4191-8191-919191919191',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb; profile jsonb; BEGIN
 a:=travelbuddy_api.account();ASSERT a->'profileDetails'->>'bio'='','legacy accounts receive defaults';
 profile:='{"displayName":"Updated Buddy","profileDetails":{"bio":"Local guide","homeBase":"Ella","languages":"English, Sinhala","interests":"Tea","travelStyle":"Slow","specialties":"Hiking","yearsExperience":5}}';
 a:=travelbuddy_api.save_profile(profile,(a->>'revision')::int);ASSERT a->>'displayName'='Updated Buddy' AND a->'profileDetails'->>'homeBase'='Ella','profile persistence';
 ASSERT a->'roles'='["provider"]','role remains server managed';
 BEGIN PERFORM travelbuddy_api.save_profile(profile,1);RAISE EXCEPTION 'stale edit accepted';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 BEGIN PERFORM travelbuddy_api.save_profile(profile||'{"roles":["admin"]}',2);RAISE EXCEPTION 'profile escalated role';EXCEPTION WHEN raise_exception THEN IF SQLERRM='profile escalated role' THEN RAISE;END IF;END;
 a:=travelbuddy_api.set_profile_media('{"kind":"photo","id":"93939393-9393-4393-8393-939393939393"}',(a->>'revision')::int);
 ASSERT a->>'avatarMediaId'='93939393-9393-4393-8393-939393939393','own photo accepted';
 BEGIN PERFORM travelbuddy_api.set_profile_media('{"kind":"photo","id":"94949494-9494-4494-8494-949494949494"}',(a->>'revision')::int);RAISE EXCEPTION 'foreign photo accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 a:=travelbuddy_api.set_profile_media('{"kind":"videos","ids":["95959595-9595-4595-8595-959595959595"]}',(a->>'revision')::int);
 ASSERT jsonb_array_length(a->'profileVideoIds')=1,'own clip accepted';
 BEGIN PERFORM travelbuddy_api.commit_profile_upload('a9191919-9191-4191-8191-919191919191','{}',1);RAISE EXCEPTION 'browser forged validated upload';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE p jsonb;BEGIN
 p:=travelbuddy_api.buddy_profile('91919191-9191-4191-8191-919191919191');
 ASSERT p->>'displayName'='Updated Buddy','public buddy profile';ASSERT NOT(p ?| ARRAY['email','roles','revision','supabase_user_id']),'private account fields absent';
 ASSERT NOT(p->'profileDetails' ?| ARRAY['interests','travelStyle']),'traveler preferences not public';
 ASSERT travelbuddy_api.media_path('93939393-9393-4393-8393-939393939393')='test/photo.png','public buddy avatar';
 BEGIN PERFORM travelbuddy_api.buddy_profile('92929292-9292-4292-8292-929292929292');RAISE EXCEPTION 'traveler profile exposed';EXCEPTION WHEN no_data_found THEN NULL;END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','b9292929-9292-4292-8292-929292929292',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM travelbuddy_api.set_profile_media('{"kind":"videos","ids":[]}',1);RAISE EXCEPTION 'traveler published video';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
UPDATE travelbuddy_backend.accounts SET data=jsonb_set(data,'{status}','"suspended"') WHERE id='91919191-9191-4191-8191-919191919191';
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM travelbuddy_api.buddy_profile('91919191-9191-4191-8191-919191919191');RAISE EXCEPTION 'suspended profile exposed';EXCEPTION WHEN no_data_found THEN NULL;END;
 BEGIN PERFORM travelbuddy_api.media_path('93939393-9393-4393-8393-939393939393');RAISE EXCEPTION 'suspended photo exposed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Profile tests passed: fields, revisions, ownership, public privacy, role protection, trusted upload registration and suspension.';
