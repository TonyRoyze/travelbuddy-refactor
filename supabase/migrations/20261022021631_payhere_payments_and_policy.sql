-- Money is held in the catalog's existing USD currency. Never reinterpret USD as LKR.
CREATE TABLE travelbuddy_private.order_payments (
 order_id uuid PRIMARY KEY REFERENCES travelbuddy_backend.booking_orders(id) ON DELETE CASCADE,
 method text NOT NULL CHECK(method IN('online','pay_later')),
 status text NOT NULL CHECK(status IN('pending','paid','due','expired','disputed')),
 amount numeric(14,2) NOT NULL CHECK(amount>=0), currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_payments_expiry_idx ON travelbuddy_private.order_payments(expires_at) WHERE status='pending';
CREATE TABLE travelbuddy_private.payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL UNIQUE REFERENCES travelbuddy_private.order_payments(order_id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE travelbuddy_private.payment_receipts (
 payment_id text PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES travelbuddy_private.payment_attempts(id) ON DELETE CASCADE,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_receipts_attempt_idx ON travelbuddy_private.payment_receipts(attempt_id);
CREATE TABLE travelbuddy_private.payment_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id text NOT NULL REFERENCES travelbuddy_private.payment_receipts(payment_id) ON DELETE CASCADE,
 booking_id uuid REFERENCES travelbuddy_backend.scheduled_bookings(id) ON DELETE CASCADE,
 amount numeric(14,2) NOT NULL CHECK(amount>0), reason text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','refunded','review')),
 gateway_reference text, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE NULLS NOT DISTINCT(payment_id,booking_id)
);
CREATE INDEX payment_refunds_booking_idx ON travelbuddy_private.payment_refunds(booking_id);
CREATE INDEX payment_refunds_queue_idx ON travelbuddy_private.payment_refunds(updated_at) WHERE status='queued';
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['order_payments','payment_attempts','payment_receipts','payment_refunds'] LOOP
 EXECUTE format('ALTER TABLE travelbuddy_private.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON travelbuddy_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON travelbuddy_private.%I TO travelbuddy_api_executor',t);
 EXECUTE format('CREATE POLICY api_executor_access ON travelbuddy_private.%I TO travelbuddy_api_executor USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;

-- Keep the tested editor validation and reservation protection; add a snapshotted payment choice.
ALTER FUNCTION travelbuddy_private.editor_package(travelbuddy_backend.packages) RENAME TO editor_package_core;
CREATE FUNCTION travelbuddy_private.editor_package(pack travelbuddy_backend.packages) RETURNS jsonb
LANGUAGE sql SET search_path='' AS $$
 SELECT jsonb_set(travelbuddy_private.editor_package_core(pack),'{input,payLater}',coalesce(pack.data->'payLater','false'))
$$;
ALTER FUNCTION travelbuddy_private.save_buddy_package(jsonb,text) RENAME TO save_buddy_package_core;
CREATE FUNCTION travelbuddy_private.save_buddy_package(input jsonb,package_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; pack travelbuddy_backend.packages;
BEGIN
 IF input ? 'payLater' AND jsonb_typeof(input->'payLater') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose valid payment terms.'; END IF;
 result:=travelbuddy_private.save_buddy_package_core(input-'payLater',package_id);
 UPDATE travelbuddy_backend.packages SET data=jsonb_set(data,'{payLater}',coalesce(input->'payLater','false')) WHERE id=result->>'id' RETURNING * INTO pack;
 RETURN travelbuddy_private.editor_package(pack);
END $$;

CREATE FUNCTION travelbuddy_private.expire_unpaid_bookings() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate uuid;
BEGIN
 -- Lock payment rows before their bookings, matching cancellation/callback writes.
 -- Expiry only releases inventory; it never takes package locks or restores places.
 FOR candidate IN SELECT order_id FROM travelbuddy_private.order_payments WHERE status='pending' AND expires_at<=now() ORDER BY order_id FOR UPDATE LOOP
 UPDATE travelbuddy_private.order_payments SET status='expired' WHERE order_id=candidate;
 UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE order_id=candidate AND status='confirmed';
 END LOOP;
END $$;
ALTER FUNCTION travelbuddy_private.checkout(jsonb) RENAME TO checkout_inventory;
CREATE FUNCTION travelbuddy_private.checkout(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; oid uuid; pay travelbuddy_private.order_payments; method text:=coalesce(input->>'paymentMethod','online'); total numeric;
BEGIN
 IF method NOT IN('online','pay_later') THEN RAISE EXCEPTION 'Choose a payment method.'; END IF;
 PERFORM travelbuddy_private.expire_unpaid_bookings();
 rows:=travelbuddy_private.checkout_inventory(input);
 oid:=(rows->0->>'orderId')::uuid;
 SELECT * INTO pay FROM travelbuddy_private.order_payments WHERE order_id=oid;
 IF FOUND THEN
 IF pay.method<>method THEN RAISE EXCEPTION 'Payment method changed. Start a new checkout.' USING ERRCODE='23505'; END IF;
 ELSE
 IF method='pay_later' AND EXISTS(SELECT 1 FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid AND NOT coalesce((b.snapshot->>'payLater')::boolean,false)) THEN RAISE EXCEPTION 'Pay on arrival is not offered for every package in this order.'; END IF;
 SELECT sum(b.total) INTO total FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid;
 INSERT INTO travelbuddy_private.order_payments(order_id,method,status,amount,expires_at)
 VALUES(oid,method,CASE WHEN total=0 THEN 'paid' WHEN method='pay_later' THEN 'due' ELSE 'pending' END,total,CASE WHEN method='online' AND total>0 THEN now()+interval '15 minutes' END);
 END IF;
 SELECT jsonb_agg(travelbuddy_private.booking_data(b) ORDER BY b.id) INTO rows FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid;
 RETURN rows;
END $$;
ALTER FUNCTION travelbuddy_private.availability(text,date,int,int) RENAME TO availability_inventory;
CREATE FUNCTION travelbuddy_private.availability(package_id text,day date,option_index int DEFAULT 0,travelers int DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM travelbuddy_private.expire_unpaid_bookings();RETURN travelbuddy_private.availability_inventory(package_id,day,option_index,travelers);END$$;
ALTER FUNCTION travelbuddy_private.booking_data(travelbuddy_backend.scheduled_bookings) RENAME TO booking_data_core;
CREATE FUNCTION travelbuddy_private.booking_data(b travelbuddy_backend.scheduled_bookings) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT travelbuddy_private.booking_data_core(b)||jsonb_build_object(
 'cancellationDeadline',((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')-interval '24 hours',
 'canCancel',b.status='confirmed' AND (coalesce(pay.status,'due')='pending' OR (coalesce((b.snapshot->>'freeCancellation')::boolean,false) AND ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')-now()>=interval '24 hours')),
 'paymentMethod',coalesce(pay.method,'pay_later'),'paymentStatus',coalesce(pay.status,'due'),'paymentExpiresAt',pay.expires_at,
 'refundStatus',(SELECT CASE WHEN count(*)=0 THEN NULL WHEN bool_and(r.status='refunded') THEN 'refunded' ELSE 'pending' END FROM travelbuddy_private.payment_refunds r JOIN travelbuddy_private.payment_receipts receipt ON receipt.payment_id=r.payment_id JOIN travelbuddy_private.payment_attempts attempt ON attempt.id=receipt.attempt_id WHERE r.booking_id=b.id OR (r.booking_id IS NULL AND attempt.order_id=b.order_id)),
 'currency','USD')
 FROM (SELECT 1) seed LEFT JOIN travelbuddy_private.order_payments pay ON pay.order_id=b.order_id
$$;
CREATE FUNCTION travelbuddy_private.payment_order(order_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); result jsonb;
BEGIN
 PERFORM travelbuddy_private.expire_unpaid_bookings();
 SELECT jsonb_build_object('id',p.order_id,'method',p.method,'status',p.status,'amount',p.amount,'currency',p.currency,'expiresAt',p.expires_at,
 'bookings',(SELECT jsonb_agg(travelbuddy_private.booking_data(b) ORDER BY b.id) FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=p.order_id))
 INTO result FROM travelbuddy_private.order_payments p JOIN travelbuddy_backend.booking_orders o ON o.id=p.order_id WHERE p.order_id=payment_order.order_id AND o.traveler_id=(a->>'id')::uuid;
 IF result IS NULL THEN RAISE EXCEPTION 'Payment order not found.' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION travelbuddy_private.begin_payment(actor_id uuid,order_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pay travelbuddy_private.order_payments; attempt uuid;
BEGIN
 PERFORM travelbuddy_private.expire_unpaid_bookings();
 PERFORM p.id FROM travelbuddy_backend.packages p WHERE p.id IN(SELECT b.package_id FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=begin_payment.order_id) ORDER BY p.id FOR UPDATE;
 SELECT op.* INTO pay FROM travelbuddy_private.order_payments op JOIN travelbuddy_backend.booking_orders o ON o.id=op.order_id JOIN travelbuddy_backend.accounts a ON a.id=o.traveler_id
 WHERE op.order_id=begin_payment.order_id AND a.supabase_user_id=actor_id AND a.data->>'status'='active' FOR UPDATE OF op;
 IF NOT FOUND OR pay.status<>'pending' OR pay.expires_at<=now() OR pay.method<>'online' OR EXISTS(SELECT 1 FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=pay.order_id AND b.status<>'confirmed') THEN RAISE EXCEPTION 'This order is no longer awaiting payment.' USING ERRCODE='PT409'; END IF;
 INSERT INTO travelbuddy_private.payment_attempts(order_id) VALUES(pay.order_id) ON CONFLICT ON CONSTRAINT payment_attempts_order_id_key DO UPDATE SET order_id=excluded.order_id RETURNING id INTO attempt;
 RETURN jsonb_build_object('attemptId',attempt,'orderId',pay.order_id,'amount',pay.amount,'currency',pay.currency);
END $$;
CREATE FUNCTION travelbuddy_private.apply_payment_notification(attempt_id uuid,payment_id text,amount numeric,currency text,status_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid; pay travelbuddy_private.order_payments; first_receipt boolean;
BEGIN
 SELECT a.order_id INTO oid FROM travelbuddy_private.payment_attempts a WHERE a.id=attempt_id;
 IF oid IS NULL OR length(payment_id) NOT BETWEEN 1 AND 120 OR status_code NOT IN('2','0','-1','-2','-3') THEN RAISE EXCEPTION 'Unknown payment notification.'; END IF;
 PERFORM p.id FROM travelbuddy_backend.packages p WHERE p.id IN(SELECT b.package_id FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid) ORDER BY p.id FOR UPDATE;
 SELECT * INTO pay FROM travelbuddy_private.order_payments p WHERE p.order_id=oid FOR UPDATE;
 IF pay.amount IS DISTINCT FROM amount OR pay.currency IS DISTINCT FROM currency THEN RAISE EXCEPTION 'Payment amount or currency does not match.'; END IF;
 -- A verified chargeback is visible to both parties; it must never trigger a second refund.
 IF status_code='-3' THEN
 UPDATE travelbuddy_private.order_payments SET status='disputed' WHERE order_id=oid;
 UPDATE travelbuddy_private.payment_refunds r SET status='review',updated_at=now() FROM travelbuddy_private.payment_receipts receipt JOIN travelbuddy_private.payment_attempts at ON at.id=receipt.attempt_id WHERE r.payment_id=receipt.payment_id AND at.order_id=oid AND r.status IN('queued','processing');
 IF pay.status='pending' THEN UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE order_id=oid; END IF;
 RETURN;
 END IF;
 -- Failure/pending callbacks do not overwrite a verified success; retry is possible until expiry.
 IF status_code<>'2' THEN RETURN; END IF;
 INSERT INTO travelbuddy_private.payment_receipts(payment_id,attempt_id) VALUES(payment_id,attempt_id) ON CONFLICT DO NOTHING;
 first_receipt:=FOUND;
 IF NOT first_receipt THEN
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_private.payment_receipts r WHERE r.payment_id=apply_payment_notification.payment_id AND r.attempt_id=apply_payment_notification.attempt_id) THEN RAISE EXCEPTION 'Payment identifier reused.'; END IF;
 RETURN;
 END IF;
 IF pay.status<>'pending' OR pay.expires_at<=now() OR EXISTS(SELECT 1 FROM travelbuddy_backend.scheduled_bookings b WHERE b.order_id=oid AND b.status<>'confirmed') THEN
 INSERT INTO travelbuddy_private.payment_refunds(payment_id,amount,reason) VALUES(payment_id,amount,'Duplicate or late payment; reservation not charged again');
 IF pay.status NOT IN('paid','disputed') THEN
 UPDATE travelbuddy_private.order_payments SET status='expired' WHERE order_id=oid;
 UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE order_id=oid;
 END IF;
 ELSE
 UPDATE travelbuddy_private.order_payments SET status='paid' WHERE order_id=oid;
 END IF;
END $$;
-- Cancellation serializes with callbacks and records an exact refund per booking.
CREATE OR REPLACE FUNCTION travelbuddy_private.cancel_booking(booking_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); b travelbuddy_backend.scheduled_bookings; pay travelbuddy_private.order_payments; receipt text;
BEGIN
 SELECT sb.* INTO b FROM travelbuddy_backend.scheduled_bookings sb JOIN travelbuddy_backend.booking_orders o ON o.id=sb.order_id WHERE sb.id=booking_id AND o.traveler_id=(a->>'id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.' USING ERRCODE='42501'; END IF;
 PERFORM p.id FROM travelbuddy_backend.packages p WHERE p.id IN(SELECT sb.package_id FROM travelbuddy_backend.scheduled_bookings sb WHERE sb.order_id=b.order_id) ORDER BY p.id FOR UPDATE;
 SELECT * INTO b FROM travelbuddy_backend.scheduled_bookings sb WHERE sb.id=booking_id;
 SELECT * INTO pay FROM travelbuddy_private.order_payments op WHERE op.order_id=b.order_id FOR UPDATE;
 IF b.status='cancelled' THEN RETURN travelbuddy_private.booking_data(b); END IF;
 IF coalesce(pay.status,'due')<>'pending' AND (NOT coalesce((b.snapshot->>'freeCancellation')::boolean,false) OR ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')-now()<interval '24 hours') THEN RAISE EXCEPTION 'This booking is outside its free cancellation period.'; END IF;
 UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE id=booking_id RETURNING * INTO b;
 IF pay.status='paid' AND b.total>0 THEN
 SELECT r.payment_id INTO receipt FROM travelbuddy_private.payment_receipts r JOIN travelbuddy_private.payment_attempts at ON at.id=r.attempt_id WHERE at.order_id=b.order_id ORDER BY r.received_at,r.payment_id LIMIT 1;
 IF receipt IS NOT NULL THEN INSERT INTO travelbuddy_private.payment_refunds(payment_id,booking_id,amount,reason) VALUES(receipt,b.id,b.total,'Free cancellation') ON CONFLICT DO NOTHING; END IF;
 ELSIF pay.status='pending' THEN
 -- A payment session always covers the complete order; cancelling a hold releases all its items.
 UPDATE travelbuddy_private.order_payments SET status='expired' WHERE order_id=b.order_id;
 UPDATE travelbuddy_backend.scheduled_bookings SET status='cancelled' WHERE order_id=b.order_id;
 END IF;
 RETURN travelbuddy_private.booking_data(b);
END $$;
CREATE FUNCTION travelbuddy_private.claim_payment_refund() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r travelbuddy_private.payment_refunds;
BEGIN
 -- Never automatically repeat an external refund with an uncertain outcome.
 UPDATE travelbuddy_private.payment_refunds SET status='review',updated_at=now() WHERE status='processing' AND updated_at<now()-interval '5 minutes';
 SELECT * INTO r FROM travelbuddy_private.payment_refunds WHERE status='queued' ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE travelbuddy_private.payment_refunds SET status='processing',updated_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'paymentId',r.payment_id,'amount',r.amount,'reason',r.reason);
END $$;
CREATE FUNCTION travelbuddy_private.finish_payment_refund(refund_id uuid,reference text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 UPDATE travelbuddy_private.payment_refunds SET status=CASE WHEN reference IS NULL THEN 'review' ELSE 'refunded' END,gateway_reference=reference,updated_at=now() WHERE id=refund_id AND status='processing';
END $$;

CREATE FUNCTION travelbuddy_api.payment_order(order_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.payment_order(order_id)$$;
CREATE FUNCTION travelbuddy_api.begin_payment(actor_id uuid,order_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.begin_payment(actor_id,order_id)$$;
CREATE FUNCTION travelbuddy_api.apply_payment_notification(attempt_id uuid,payment_id text,amount numeric,currency text,status_code text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.apply_payment_notification(attempt_id,payment_id,amount,currency,status_code)$$;
CREATE FUNCTION travelbuddy_api.claim_payment_refund() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.claim_payment_refund()$$;
CREATE FUNCTION travelbuddy_api.finish_payment_refund(refund_id uuid,reference text DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT travelbuddy_private.finish_payment_refund(refund_id,reference)$$;
DO $$DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('travelbuddy_private','travelbuddy_api') AND p.proname IN('editor_package','editor_package_core','save_buddy_package','save_buddy_package_core','expire_unpaid_bookings','checkout','checkout_inventory','availability','availability_inventory','booking_data','booking_data_core','payment_order','begin_payment','apply_payment_notification','cancel_booking','claim_payment_refund','finish_payment_refund') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 IF f.nspname='travelbuddy_private' THEN EXECUTE format('ALTER FUNCTION %s OWNER TO travelbuddy_api_executor',f.signature); END IF;
 IF f.proname IN('begin_payment','apply_payment_notification','claim_payment_refund','finish_payment_refund') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 ELSIF f.proname IN('save_buddy_package','checkout','payment_order','cancel_booking') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 ELSIF f.proname='availability' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated',f.signature); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
CREATE FUNCTION travelbuddy_api.expire_payment_holds() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT travelbuddy_private.expire_unpaid_bookings()$$;
ALTER FUNCTION travelbuddy_api.expire_payment_holds() OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_api.expire_payment_holds() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_api.expire_payment_holds() TO service_role;
-- Booking history must reflect expired payment holds even when no inventory page is open.
ALTER FUNCTION travelbuddy_private.bookings() RENAME TO bookings_core;
CREATE FUNCTION travelbuddy_private.bookings() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM travelbuddy_private.expire_unpaid_bookings(); RETURN travelbuddy_private.bookings_core();END$$;
ALTER FUNCTION travelbuddy_private.bookings() OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_private.bookings_core(),travelbuddy_private.bookings() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION travelbuddy_private.bookings() TO authenticated;
NOTIFY pgrst,'reload schema';

-- The copied inventory function uses its new PL/pgSQL parameter namespace.
CREATE OR REPLACE FUNCTION travelbuddy_private.availability_inventory(package_id text, day date, option_index int DEFAULT 0, travelers int DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pack travelbuddy_backend.packages; selected jsonb; next_slot jsonb;
BEGIN
 IF day IS NULL OR option_index IS NULL OR option_index NOT BETWEEN 0 AND 7 OR travelers IS NULL OR travelers NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Choose a valid date, option and traveler count.'; END IF;
 PERFORM travelbuddy_private.package_detail(package_id);
 SELECT * INTO pack FROM travelbuddy_backend.packages WHERE id=package_id;
 IF pack.data->'options'->option_index IS NULL THEN RAISE EXCEPTION 'Choose a valid experience option.'; END IF;
 WITH used AS (SELECT b.time,sum(b.travelers) n FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.date=day AND b.option_index=availability_inventory.option_index AND b.status='confirmed' GROUP BY b.time)
 SELECT coalesce(jsonb_agg(jsonb_build_object('time',s.slot_time,'capacity',s.capacity,'remaining',greatest(0,s.capacity-coalesce(u.n,0))) ORDER BY s.slot_time),'[]') INTO selected FROM travelbuddy_private.slots(pack,day,option_index) s LEFT JOIN used u ON u.time=s.slot_time;
 WITH used AS (SELECT b.date,b.time,sum(b.travelers) n FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.option_index=availability_inventory.option_index AND b.status='confirmed' AND b.date BETWEEN greatest(day,(now() AT TIME ZONE 'Asia/Colombo')::date) AND (now() AT TIME ZONE 'Asia/Colombo')::date+180 GROUP BY b.date,b.time)
 SELECT jsonb_build_object('date',d::date,'time',s.slot_time) INTO next_slot FROM generate_series(greatest(day,(now() AT TIME ZONE 'Asia/Colombo')::date)::timestamp,((now() AT TIME ZONE 'Asia/Colombo')::date+180)::timestamp,interval '1 day') d CROSS JOIN LATERAL travelbuddy_private.slots(pack,d::date,option_index) s LEFT JOIN used u ON u.date=d::date AND u.time=s.slot_time WHERE s.capacity-coalesce(u.n,0)>=travelers ORDER BY d,s.slot_time LIMIT 1;
 RETURN jsonb_build_object('date',day,'slots',selected,'next',next_slot);
END $$;

-- Discovery must ignore elapsed holds even while the payment worker is down.
-- Restore legacy discovery filters against actual inventory and provider presence.
CREATE OR REPLACE FUNCTION travelbuddy_private.catalog_has_places(package_id text,selected_day date DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE pack travelbuddy_backend.packages; first_day date:=coalesce(selected_day,(now() AT TIME ZONE 'Asia/Colombo')::date); last_day date:=coalesce(selected_day,(now() AT TIME ZONE 'Asia/Colombo')::date+180);
BEGIN
 SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id=package_id;
 RETURN EXISTS(
 SELECT 1 FROM generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d
 CROSS JOIN LATERAL jsonb_array_elements(pack.data->'options') WITH ORDINALITY o(value,n)
 CROSS JOIN LATERAL travelbuddy_private.slots(pack,d::date,(o.n-1)::int) s
 WHERE s.capacity>coalesce((SELECT sum(b.travelers) FROM travelbuddy_backend.scheduled_bookings b WHERE b.package_id=pack.id AND b.date=d::date AND b.option_index=(o.n-1)::int AND b.time=s.slot_time AND b.status='confirmed' AND NOT EXISTS(SELECT 1 FROM travelbuddy_private.order_payments pay WHERE pay.order_id=b.order_id AND (pay.status='expired' OR (pay.status='pending' AND pay.expires_at<=now())))),0)
 );
END $$;
