BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('a8181818-1818-4181-8181-181818181811','a8181818-1818-4181-8181-181818181812','{"displayName":"Currency traveler","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('b8282828-2828-4282-8282-282828282821','b8282828-2828-4282-8282-282828282822','{"displayName":"Currency Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now());
SELECT set_config('request.jwt.claim.sub','a8181818-1818-4181-8181-181818181812',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb; updated jsonb; BEGIN
 a:=travelbuddy_api.account();ASSERT a->'profileDetails'->>'displayCurrency'='LKR','LKR profile default';
 updated:=travelbuddy_api.save_profile(jsonb_build_object('displayName',a->>'displayName','profileDetails',a->'profileDetails'||'{"displayCurrency":"EUR"}'),(a->>'revision')::int);
 ASSERT updated->'profileDetails'->>'displayCurrency'='EUR','Currency persisted';
 ASSERT travelbuddy_api.account()->'profileDetails'->>'displayCurrency'='EUR','Currency survives read';
 BEGIN PERFORM travelbuddy_api.save_profile(jsonb_build_object('displayName',a->>'displayName','profileDetails',a->'profileDetails'||'{"displayCurrency":"ZZZ"}'),(updated->>'revision')::int);RAISE EXCEPTION 'Invalid currency accepted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Choose a supported%';END;
 BEGIN PERFORM travelbuddy_api.save_profile(jsonb_build_object('displayName',a->>'displayName','profileDetails',a->'profileDetails'),(a->>'revision')::int);RAISE EXCEPTION 'Stale currency save';EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 -- No client can change transaction currency through profile fields.
 BEGIN PERFORM travelbuddy_api.save_profile(jsonb_build_object('displayName',a->>'displayName','profileDetails',updated->'profileDetails'||'{"settlementCurrency":"USD"}'),(updated->>'revision')::int);RAISE EXCEPTION 'Settlement override accepted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Unknown profile%';END;
 ASSERT NOT (travelbuddy_api.buddy_profile('b8282828-2828-4282-8282-282828282821')->'profileDetails' ? 'displayCurrency'),'Display preference stays private';
END $$;
ROLLBACK;
SELECT 'Currency profile: default, persistence, validation, revision protection and public privacy passed.';
