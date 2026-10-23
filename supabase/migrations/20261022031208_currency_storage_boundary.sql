-- Keep the version-one package/snapshot JSON readable by legacy inventory readers.
-- Currency is explicit typed state; migration provenance is private administrative data.
ALTER TABLE travelbuddy_backend.packages ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD' CHECK(currency IN('USD','LKR'));
UPDATE travelbuddy_backend.packages SET currency=coalesce(data->>'currency',currency);
ALTER TABLE travelbuddy_backend.packages ALTER COLUMN currency SET DEFAULT 'LKR';
ALTER TABLE travelbuddy_backend.scheduled_bookings ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD' CHECK(currency IN('USD','LKR'));
UPDATE travelbuddy_backend.scheduled_bookings b SET currency=pay.currency FROM travelbuddy_private.order_payments pay WHERE pay.order_id=b.order_id;
CREATE TABLE travelbuddy_private.package_currency_migrations (
 package_id text PRIMARY KEY REFERENCES travelbuddy_backend.packages(id) ON DELETE CASCADE,
 provenance jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE travelbuddy_private.package_currency_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON travelbuddy_private.package_currency_migrations FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO travelbuddy_private.package_currency_migrations(package_id,provenance) SELECT id,data->'currencyMigration' FROM travelbuddy_backend.packages WHERE data ? 'currencyMigration';
UPDATE travelbuddy_backend.packages SET data=data-ARRAY['currency','currencyMigration'] WHERE data ?| ARRAY['currency','currencyMigration'];
CREATE OR REPLACE FUNCTION travelbuddy_private.package_data(data jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT travelbuddy_private.package_data_without_currency(data)||jsonb_build_object('currency',coalesce((SELECT p.currency FROM travelbuddy_backend.packages p WHERE p.id=$1->>'id'),'USD'))
$$;
DO $$DECLARE definition text; old text; BEGIN
 SELECT pg_get_functiondef('travelbuddy_private.save_buddy_package(jsonb,text)'::regprocedure) INTO definition;
 old:='data=jsonb_set(jsonb_set(data,''{payLater}'',coalesce(input->''payLater'',''false'')),''{currency}'',''"LKR"'')';
 IF position(old in definition)=0 THEN RAISE EXCEPTION 'Expected currency-aware package wrapper missing'; END IF;
 EXECUTE replace(definition,old,'currency=''LKR'',data=jsonb_set(data,''{payLater}'',coalesce(input->''payLater'',''false''))');
 SELECT pg_get_functiondef('travelbuddy_private.checkout(jsonb)'::regprocedure) INTO definition;
 old:='SELECT 1 FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid AND coalesce(b.snapshot->>''currency'',''USD'')<>''LKR''';
 IF position(old in definition)=0 THEN RAISE EXCEPTION 'Expected checkout currency guard missing'; END IF;
 definition:=replace(definition,old,'SELECT 1 FROM travelbuddy_backend.scheduled_bookings b JOIN travelbuddy_backend.packages p ON p.id=b.package_id WHERE b.order_id=oid AND p.currency<>''LKR''');
 old:=' SELECT jsonb_agg(travelbuddy_private.booking_data(b) ORDER BY b.id) INTO rows';
 IF position(old in definition)=0 THEN RAISE EXCEPTION 'Expected checkout result missing'; END IF;
 EXECUTE replace(definition,old,' UPDATE travelbuddy_backend.scheduled_bookings b SET currency=payment_row.currency FROM travelbuddy_private.order_payments payment_row WHERE b.order_id=oid AND payment_row.order_id=b.order_id;'||old);
END $$;

CREATE OR REPLACE FUNCTION travelbuddy_private.booking_data(b travelbuddy_backend.scheduled_bookings) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT travelbuddy_private.booking_data_core(b)||jsonb_build_object(
 'cancellationDeadline',((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')-interval '24 hours',
 'canCancel',b.status='confirmed' AND (coalesce(pay.status,'due')='pending' OR (coalesce((b.snapshot->>'freeCancellation')::boolean,false) AND ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')-now()>=interval '24 hours')),
 'paymentMethod',coalesce(pay.method,'pay_later'),'paymentStatus',coalesce(pay.status,'due'),'paymentExpiresAt',pay.expires_at,
 'refundStatus',(SELECT CASE WHEN count(*)=0 THEN NULL WHEN bool_and(r.status='refunded') THEN 'refunded' ELSE 'pending' END FROM travelbuddy_private.payment_refunds r JOIN travelbuddy_private.payment_receipts receipt ON receipt.payment_id=r.payment_id JOIN travelbuddy_private.payment_attempts attempt ON attempt.id=receipt.attempt_id WHERE r.booking_id=b.id OR (r.booking_id IS NULL AND attempt.order_id=b.order_id)),
 'currency',coalesce(pay.currency,b.currency),'experience',travelbuddy_private.package_data(b.snapshot)||jsonb_build_object('currency',coalesce(pay.currency,b.currency)))
 FROM (SELECT 1) seed LEFT JOIN travelbuddy_private.order_payments pay ON pay.order_id=b.order_id
$$;
NOTIFY pgrst,'reload schema';
