BEGIN;
DO $$ BEGIN IF current_database()<>'travelbuddy_refactor_test' THEN RAISE EXCEPTION 'Use disposable database'; END IF; END $$;
INSERT INTO travelbuddy_backend.accounts(id,supabase_user_id,data,updated_at) VALUES
('a7171717-1717-4171-8171-171717171711','a7171717-1717-4171-8171-171717171712','{"displayName":"Payment Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now()),
('b7272727-2727-4272-8272-272727272721','b7272727-2727-4272-8272-272727272722','{"displayName":"Payment Traveler","roles":["traveler"],"status":"active","onboarding":"completed"}',now()),
('c7373737-3737-4373-8373-373737373731','c7373737-3737-4373-8373-373737373732','{"displayName":"Other Buddy","roles":["provider"],"status":"active","onboarding":"completed"}',now());
INSERT INTO travelbuddy_backend.packages(id,owner_id,title,destination,country,category,price,rating,duration_minutes,duration,free_cancellation,published,data,schedule,updated_at)
SELECT 'payment-qa-pack','a7171717-1717-4171-8171-171717171711',title,'Ella','Sri Lanka',category,42,0,120,'2 hours',true,true,
data||'{"id":"payment-qa-pack","payLater":true,"freeCancellation":true,"options":[{"name":"Test","price":42,"capacity":12,"times":["09:00"]}]}',
jsonb_build_object('startDate',current_date,'endDate',current_date+180,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'exceptions','[]'::jsonb),now() FROM travelbuddy_backend.packages LIMIT 1;
SELECT set_config('request.jwt.claim.sub','b7272727-2727-4272-8272-272727272722',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE rows jsonb; input jsonb; session jsonb; thread uuid; BEGIN
 input:=jsonb_build_object('idempotencyKey',gen_random_uuid(),'travelerName','Test Traveler','travelerEmail','test@example.test','paymentMethod','online','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'experienceId','payment-qa-pack','option',0,'date',current_date+3,'time','09:00','travelers',2)));
 rows:=travelbuddy_api.checkout(input);
 ASSERT rows->0->>'paymentStatus'='pending','Unpaid is never paid';
 ASSERT rows->0->>'currency'='LKR','New checkout always settles in LKR';
 ASSERT rows=travelbuddy_api.checkout(input),'Retry is identical';
 PERFORM set_config('test.payment.order',rows->0->>'orderId',true); PERFORM set_config('test.payment.booking',rows->0->>'id',true);
 ASSERT (travelbuddy_api.payment_order((rows->0->>'orderId')::uuid)->>'amount')::numeric=84,'Server amount';
 BEGIN PERFORM travelbuddy_api.begin_payment('b7272727-2727-4272-8272-272727272722',(rows->0->>'orderId')::uuid);RAISE EXCEPTION 'Client began a service payment';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM travelbuddy_api.apply_payment_notification(gen_random_uuid(),'fake',84,'LKR','2');RAISE EXCEPTION 'Client forged payment';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM travelbuddy_api.provider_dashboard();RAISE EXCEPTION 'Traveler viewed dashboard';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 thread:=travelbuddy_api.booking_chat((rows->0->>'id')::uuid);
 PERFORM travelbuddy_api.send_message(thread,'Can we meet at the station?');
 PERFORM set_config('test.payment.thread',thread::text,true);
 input:=jsonb_set(input,'{idempotencyKey}',to_jsonb(gen_random_uuid()::text))||'{"paymentMethod":"pay_later"}';
 rows:=travelbuddy_api.checkout(input);
 ASSERT rows->0->>'paymentStatus'='due','Arrival amount remains due';
 ASSERT rows->0->>'paymentMethod'='pay_later','Arrival terms persisted';
 PERFORM set_config('test.arrival.booking',rows->0->>'id',true);
END $$;
RESET ROLE;
DO $$DECLARE attempt jsonb; oid uuid:=current_setting('test.payment.order')::uuid; BEGIN
 attempt:=travelbuddy_api.begin_payment('b7272727-2727-4272-8272-272727272722',oid);
 PERFORM set_config('test.payment.attempt',attempt->>'attemptId',true);
 BEGIN PERFORM travelbuddy_api.apply_payment_notification((attempt->>'attemptId')::uuid,'receipt1',1,'LKR','2');RAISE EXCEPTION 'Wrong total accepted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Payment amount%';END;
 BEGIN PERFORM travelbuddy_api.apply_payment_notification((attempt->>'attemptId')::uuid,'receipt-wrong-currency',84,'USD','2');RAISE EXCEPTION 'USD callback accepted';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Payment amount%';END;
 PERFORM travelbuddy_api.apply_payment_notification((attempt->>'attemptId')::uuid,'receipt1',84,'LKR','2');
 PERFORM travelbuddy_api.apply_payment_notification((attempt->>'attemptId')::uuid,'receipt1',84,'LKR','2');
 PERFORM travelbuddy_api.apply_payment_notification((attempt->>'attemptId')::uuid,'receipt1',84,'LKR','-2');
 ASSERT (SELECT status FROM travelbuddy_private.order_payments WHERE order_id=oid)='paid','Failure cannot downgrade paid';
 ASSERT (SELECT count(*) FROM travelbuddy_private.payment_receipts WHERE payment_id='receipt1')=1,'Duplicate callback is idempotent';
 PERFORM travelbuddy_api.apply_payment_notification((attempt->>'attemptId')::uuid,'receipt2',84,'LKR','2');
 ASSERT (SELECT count(*) FROM travelbuddy_private.payment_refunds WHERE payment_id='receipt2')=1,'Duplicate charge refund queued';
END $$;
SELECT set_config('request.jwt.claim.sub','a7171717-1717-4171-8171-171717171712',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE dash jsonb; t uuid:=current_setting('test.payment.thread')::uuid; m jsonb; saved jsonb; BEGIN
 dash:=travelbuddy_api.provider_dashboard();
 ASSERT (dash->>'total')::int=2,'Own bookings visible';
 ASSERT (dash->'conversations'->0->>'unread')::int=1,'Unread incoming message';
 ASSERT travelbuddy_api.booking_chat(current_setting('test.payment.booking')::uuid)=t,'Provider reuses thread';
 m:=travelbuddy_api.messages(t);PERFORM travelbuddy_api.mark_conversation_read(t,(m->0->>'id')::uuid);
 ASSERT (travelbuddy_api.provider_dashboard()->'conversations'->0->>'unread')::int=0,'Read marker clears badge';
 PERFORM travelbuddy_api.send_message(t,'Yes, see you there.');
 saved:=travelbuddy_api.buddy_package('payment-qa-pack');
 ASSERT (saved->'input'->>'payLater')::boolean,'Package editor includes payment terms';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','c7373737-3737-4373-8373-373737373732',true);
SET LOCAL ROLE authenticated;
DO $$BEGIN
 ASSERT (travelbuddy_api.provider_dashboard()->>'total')::int=0,'Other provider cannot see bookings';
 BEGIN PERFORM travelbuddy_api.payment_order(current_setting('test.payment.order')::uuid);RAISE EXCEPTION 'Other account read payment';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM travelbuddy_api.booking_chat(current_setting('test.payment.booking')::uuid);RAISE EXCEPTION 'Other account joined chat';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','b7272727-2727-4272-8272-272727272722',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE b jsonb; BEGIN
 b:=travelbuddy_api.cancel_booking(current_setting('test.payment.booking')::uuid);
 ASSERT b->>'refundStatus'='pending','Paid cancellation queues refund';
 ASSERT b=travelbuddy_api.cancel_booking(current_setting('test.payment.booking')::uuid),'Cancellation replay safe';
 b:=travelbuddy_api.cancel_booking(current_setting('test.arrival.booking')::uuid);
 ASSERT b->>'refundStatus' IS NULL,'Unpaid arrival cancellation has no online refund';
END $$;
RESET ROLE;
DO $$DECLARE refund jsonb; BEGIN
 ASSERT (SELECT count(*) FROM travelbuddy_private.payment_refunds WHERE booking_id=current_setting('test.payment.booking')::uuid)=1,'No duplicate cancellation refund';
 refund:=travelbuddy_api.claim_payment_refund();PERFORM travelbuddy_api.finish_payment_refund((refund->>'id')::uuid,'refund-confirmed');
 ASSERT (SELECT status FROM travelbuddy_private.payment_refunds WHERE id=(refund->>'id')::uuid)='refunded','Only gateway completion marks refund';
END $$;
DO $$BEGIN
 PERFORM travelbuddy_api.apply_payment_notification(current_setting('test.payment.attempt')::uuid,'receipt1',84,'LKR','-3');
 ASSERT (SELECT status FROM travelbuddy_private.order_payments WHERE order_id=current_setting('test.payment.order')::uuid)='disputed','Chargebacks stay visible';
 ASSERT NOT EXISTS(SELECT 1 FROM travelbuddy_private.payment_refunds WHERE payment_id IN('receipt1','receipt2') AND status IN('queued','processing')),'Chargebacks stop pending automatic refunds';
END $$;
-- A full unpaid slot becomes discoverable as soon as its hold expires, without a worker.
SET LOCAL ROLE authenticated;
DO $$DECLARE rows jsonb; input jsonb; BEGIN
 input:=jsonb_build_object('idempotencyKey',gen_random_uuid(),'travelerName','Test Traveler','travelerEmail','test@example.test','paymentMethod','online','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'experienceId','payment-qa-pack','option',0,'date',current_date+3,'time','09:00','travelers',12)));
 rows:=travelbuddy_api.checkout(input);
 PERFORM set_config('test.expiry.order',rows->0->>'orderId',true);
 BEGIN PERFORM travelbuddy_api.checkout(input||'{"paymentMethod":"pay_later"}');RAISE EXCEPTION 'Changed method replay accepted';EXCEPTION WHEN unique_violation THEN NULL;END;
END $$;
RESET ROLE;
DO $$DECLARE oid uuid:=current_setting('test.expiry.order')::uuid; availability jsonb; BEGIN
 ASSERT NOT travelbuddy_private.catalog_has_places('payment-qa-pack',current_date+3),'Full hold hides inventory';
 UPDATE travelbuddy_private.order_payments SET expires_at=now()-interval '1 minute' WHERE order_id=oid;
 ASSERT travelbuddy_private.catalog_has_places('payment-qa-pack',current_date+3),'Search ignores elapsed holds without maintenance';
 availability:=travelbuddy_api.availability('payment-qa-pack',current_date+3,0,12);
 ASSERT availability->'slots'->0->>'remaining'='12','Availability releases expired places';
 ASSERT (SELECT status FROM travelbuddy_private.order_payments WHERE order_id=oid)='expired','Expiry persists';
 UPDATE travelbuddy_backend.packages SET data=jsonb_set(data,'{payLater}','false') WHERE id='payment-qa-pack';
END $$;
SET LOCAL ROLE authenticated;
DO $$BEGIN
 BEGIN
 PERFORM travelbuddy_api.checkout(jsonb_build_object('idempotencyKey',gen_random_uuid(),'travelerName','Test Traveler','travelerEmail','test@example.test','paymentMethod','pay_later','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'experienceId','payment-qa-pack','option',0,'date',current_date+3,'time','09:00','travelers',1))));
 RAISE EXCEPTION 'Unpermitted arrival booking accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Pay on arrival is not offered%'; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Payments/dashboard: authorization, exact totals, callbacks, replay, duplicate charges, refunds, arrival terms and private inbox passed.';
