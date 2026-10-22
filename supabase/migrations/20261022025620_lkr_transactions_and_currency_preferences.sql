-- Prices are set once in LKR; display FX never changes a booking or gateway amount.
-- Frankfurter latest USD quote fetched 2026-10-22: 1 LKR = 0.00302 USD, observation 2026-10-21.
-- Preserve historical booking snapshots, totals and their original currencies.
DO $$DECLARE p travelbuddy_backend.packages; options jsonb; doc jsonb; rate numeric:=1/0.00302::numeric; BEGIN
 FOR p IN SELECT candidate.* FROM travelbuddy_backend.packages candidate WHERE coalesce(candidate.data->>'currency',to_jsonb(candidate)->>'currency','USD')='USD' ORDER BY candidate.id FOR UPDATE LOOP
 SELECT jsonb_agg(jsonb_set(o,'{price}',to_jsonb(round((o->>'price')::numeric*rate,2))) ORDER BY n) INTO options FROM jsonb_array_elements(p.data->'options') WITH ORDINALITY t(o,n);
 doc:=p.data||jsonb_build_object('currency','LKR','options',options,'price',round(p.price::numeric*rate,2),'currencyMigration',jsonb_build_object('source','Frankfurter','rateDate','2026-10-21','fromCurrency','USD','fromPrice',p.price,'lkrPerUsd',rate,'optionPrices',(SELECT jsonb_agg(o->'price') FROM jsonb_array_elements(p.data->'options') o)));
 IF jsonb_typeof(p.data->'originalPrice')='number' THEN doc:=jsonb_set(doc,'{originalPrice}',to_jsonb(round((p.data->>'originalPrice')::numeric*rate,2))); END IF;
 UPDATE travelbuddy_backend.packages SET data=doc,price=round(p.price::numeric*rate,2),revision=revision+1,updated_at=now() WHERE id=p.id;
 END LOOP;
END $$;
ALTER TABLE travelbuddy_private.order_payments DROP CONSTRAINT order_payments_currency_check;
ALTER TABLE travelbuddy_private.order_payments ADD CONSTRAINT order_payments_currency_check CHECK(currency IN('LKR','USD'));
ALTER TABLE travelbuddy_private.order_payments ALTER COLUMN currency SET DEFAULT 'LKR';
-- Existing unpaid gateway sessions cannot be reused with a different currency.
WITH expired AS(UPDATE travelbuddy_private.order_payments SET status='expired' WHERE currency='USD' AND status='pending' RETURNING order_id)
UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE order_id IN(SELECT order_id FROM expired) AND status='confirmed';

ALTER FUNCTION travelbuddy_private.package_data(jsonb) RENAME TO package_data_without_currency;
CREATE FUNCTION travelbuddy_private.package_data(data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT travelbuddy_private.package_data_without_currency(data)||jsonb_build_object('currency',coalesce(data->>'currency','USD')) $$;
ALTER FUNCTION travelbuddy_private.profile_fields(jsonb) RENAME TO profile_fields_without_currency;
CREATE FUNCTION travelbuddy_private.profile_fields(raw jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT travelbuddy_private.profile_fields_without_currency(raw)||jsonb_build_object('displayCurrency',coalesce(raw->>'displayCurrency','LKR')) $$;
ALTER FUNCTION travelbuddy_private.save_profile(jsonb,int) RENAME TO save_profile_without_currency;
CREATE FUNCTION travelbuddy_private.save_profile(input jsonb,expected_revision int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); currency text:=coalesce(input->'profileDetails'->>'displayCurrency',a->'profileDetails'->>'displayCurrency','LKR'); result jsonb;
BEGIN
 IF currency NOT IN('LKR','USD','EUR','GBP','AUD','CAD','INR','JPY','SGD','CNY','AED','CHF','NZD') OR (input->'profileDetails' ? 'displayCurrency' AND jsonb_typeof(input->'profileDetails'->'displayCurrency') IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'Choose a supported display currency.'; END IF;
 result:=travelbuddy_private.save_profile_without_currency(jsonb_set(input,'{profileDetails}',(input->'profileDetails')-'displayCurrency'),expected_revision);
 UPDATE travelbuddy_backend.accounts SET data=jsonb_set(data,'{profileDetails,displayCurrency}',to_jsonb(currency)) WHERE id=(result->>'id')::uuid;
 RETURN travelbuddy_private.account();
END $$;
ALTER FUNCTION travelbuddy_private.buddy_profile(uuid) RENAME TO buddy_profile_without_currency;
CREATE FUNCTION travelbuddy_private.buddy_profile(profile_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT travelbuddy_private.buddy_profile_without_currency(profile_id)#-'{profileDetails,displayCurrency}'$$;

-- Modify the existing guarded implementations without changing inventory/idempotency rules.
DO $$DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('travelbuddy_private.save_buddy_package(jsonb,text)'::regprocedure) INTO definition;
 IF position('data=jsonb_set(data,''{payLater}''' in definition)=0 THEN RAISE EXCEPTION 'Expected package payment wrapper missing'; END IF;
 definition:=replace(definition,'data=jsonb_set(data,''{payLater}'',coalesce(input->''payLater'',''false''))','data=jsonb_set(jsonb_set(data,''{payLater}'',coalesce(input->''payLater'',''false'')),''{currency}'',''"LKR"'')');EXECUTE definition;
 SELECT pg_get_functiondef('travelbuddy_private.begin_payment(uuid,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'IF NOT FOUND OR pay.status<>''pending''','IF NOT FOUND OR pay.currency<>''LKR'' OR pay.status<>''pending''');EXECUTE definition;
 SELECT pg_get_functiondef('travelbuddy_private.checkout(jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'oid:=(rows->0->>''orderId'')::uuid;','oid:=(rows->0->>''orderId'')::uuid; IF EXISTS(SELECT 1 FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid AND coalesce(b.snapshot->>''currency'',''USD'')<>''LKR'') THEN RAISE EXCEPTION ''This package needs LKR pricing before it can be booked.''; END IF;');EXECUTE definition;
 SELECT pg_get_functiondef('travelbuddy_private.booking_data(travelbuddy_backend.scheduled_bookings)'::regprocedure) INTO definition;
 definition:=replace(definition,'''currency'',''USD''','''currency'',coalesce(pay.currency,b.snapshot->>''currency'',''USD'')');EXECUTE definition;
 -- LKR prices need a larger bound than the previous USD editor limit.
 SELECT pg_get_functiondef('travelbuddy_private.save_buddy_package_core(jsonb,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'''price'',0,100000)','''price'',0,10000000)');EXECUTE definition;
END $$;
DO $$DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='travelbuddy_private' AND p.proname IN('package_data','package_data_without_currency','profile_fields','profile_fields_without_currency','save_profile','save_profile_without_currency','buddy_profile','buddy_profile_without_currency') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 EXECUTE format('ALTER FUNCTION %s OWNER TO travelbuddy_api_executor',f.signature);
 IF f.proname='save_profile' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 IF f.proname='buddy_profile' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f.signature); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
