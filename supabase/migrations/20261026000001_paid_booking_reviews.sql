-- An expired or unpaid payment hold must never qualify for a verified review.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('travelbuddy_private.review_dashboard()'::regprocedure) INTO definition;
  definition := replace(definition,
    'JOIN travelbuddy_backend.booking_orders o ON o.id = b.order_id',
    'JOIN travelbuddy_backend.booking_orders o ON o.id = b.order_id JOIN travelbuddy_private.order_payments pay ON pay.order_id = b.order_id');
  definition := replace(definition,
    'AND b.status = ''confirmed''',
    'AND b.status = ''confirmed'' AND pay.status IN (''paid'',''due'')');
  IF definition NOT LIKE '%pay.status IN (''paid'',''due'')%' THEN
    RAISE EXCEPTION 'Could not restrict review eligibility to paid/arrival bookings';
  END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef('travelbuddy_private.submit_review(uuid,integer,text)'::regprocedure) INTO definition;
  definition := replace(definition,
    'JOIN travelbuddy_backend.booking_orders o ON o.id = b.order_id',
    'JOIN travelbuddy_backend.booking_orders o ON o.id = b.order_id JOIN travelbuddy_private.order_payments pay ON pay.order_id = b.order_id');
  definition := replace(definition,
    'WHERE b.id = submit_review.booking_id AND o.traveler_id = owner_id',
    'WHERE b.id = submit_review.booking_id AND o.traveler_id = owner_id AND pay.status IN (''paid'',''due'')');
  IF definition NOT LIKE '%pay.status IN (''paid'',''due'')%' THEN
    RAISE EXCEPTION 'Could not restrict review submission to paid/arrival bookings';
  END IF;
  EXECUTE definition;
END $$;

NOTIFY pgrst,'reload schema';
