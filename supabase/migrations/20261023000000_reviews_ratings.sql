-- Verified reviews: one review per completed booking, written by its traveler.
CREATE TABLE travelbuddy_backend.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES travelbuddy_backend.scheduled_bookings(id) ON DELETE CASCADE,
  package_id varchar(80) NOT NULL REFERENCES travelbuddy_backend.packages(id) ON DELETE CASCADE,
  traveler_id uuid NOT NULL REFERENCES travelbuddy_backend.accounts(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body varchar(1000) NOT NULL CHECK (length(trim(body)) BETWEEN 20 AND 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX booking_reviews_package_created_idx
  ON travelbuddy_backend.booking_reviews(package_id, created_at DESC, id);
CREATE INDEX booking_reviews_traveler_created_idx
  ON travelbuddy_backend.booking_reviews(traveler_id, created_at DESC, id);

ALTER TABLE travelbuddy_backend.booking_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON travelbuddy_backend.booking_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON travelbuddy_backend.booking_reviews TO travelbuddy_api_executor;
CREATE POLICY api_executor_access ON travelbuddy_backend.booking_reviews
  TO travelbuddy_api_executor USING (true) WITH CHECK (true);

-- Replace the old seeded display ratings with verified-review aggregates.
UPDATE travelbuddy_backend.packages p
SET rating = 0,
    data = p.data || jsonb_build_object('rating', 0, 'reviews', 0);

CREATE FUNCTION travelbuddy_private.review_dashboard() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account_row jsonb := travelbuddy_private.account();
  owner_id uuid := (account_row->>'id')::uuid;
  eligible jsonb;
  submitted jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(travelbuddy_private.booking_data(b) ORDER BY b.date DESC, b.time DESC, b.id), '[]'::jsonb)
  INTO eligible
  FROM travelbuddy_backend.scheduled_bookings b
  JOIN travelbuddy_backend.booking_orders o ON o.id = b.order_id
  WHERE o.traveler_id = owner_id
    AND b.status = 'confirmed'
    AND ((b.date + b.time::time) AT TIME ZONE 'Asia/Colombo')
      + make_interval(secs => substring(b.snapshot->>'duration' FROM '^[0-9.]+')::double precision
        * CASE WHEN b.snapshot->>'duration' LIKE '%minute%' THEN 60 ELSE 3600 END) <= now()
    AND NOT EXISTS (
      SELECT 1 FROM travelbuddy_backend.booking_reviews r
      WHERE r.booking_id = b.id AND r.traveler_id = owner_id
    );

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'bookingId', r.booking_id,
      'experienceId', r.package_id,
      'rating', r.rating,
      'body', r.body,
      'createdAt', r.created_at,
      'experience', travelbuddy_private.package_data(b.snapshot)
    ) ORDER BY r.created_at DESC, r.id
  ), '[]'::jsonb)
  INTO submitted
  FROM travelbuddy_backend.booking_reviews r
  JOIN travelbuddy_backend.scheduled_bookings b ON b.id = r.booking_id
  WHERE r.traveler_id = owner_id;

  RETURN jsonb_build_object('eligible', eligible, 'reviews', submitted);
END $$;

CREATE FUNCTION travelbuddy_private.experience_reviews(package_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pack travelbuddy_backend.packages;
  average_rating numeric;
  review_count bigint;
  review_list jsonb;
BEGIN
  SELECT p.* INTO pack
  FROM travelbuddy_backend.packages p
  LEFT JOIN travelbuddy_backend.accounts a ON a.id = p.owner_id
  WHERE p.id = experience_reviews.package_id
    AND p.published
    AND (p.owner_id IS NULL OR a.data->>'status' = 'active');
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT coalesce(round(avg(r.rating)::numeric, 2), 0), count(*)
  INTO average_rating, review_count
  FROM travelbuddy_backend.booking_reviews r
  WHERE r.package_id = experience_reviews.package_id;

  SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC, id), '[]'::jsonb)
  INTO review_list
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'rating', r.rating,
      'body', r.body,
      'createdAt', r.created_at,
      'author', coalesce(a.data->>'displayName', 'Traveler')
    ) AS item, r.created_at, r.id
    FROM travelbuddy_backend.booking_reviews r
    JOIN travelbuddy_backend.accounts a ON a.id = r.traveler_id
    WHERE r.package_id = experience_reviews.package_id
    ORDER BY r.created_at DESC, r.id
    LIMIT 100
  ) visible_reviews;

  RETURN jsonb_build_object('rating', average_rating, 'reviews', review_count, 'items', review_list);
END $$;

CREATE FUNCTION travelbuddy_private.submit_review(booking_id uuid, rating integer, body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account_row jsonb := travelbuddy_private.account();
  owner_id uuid := (account_row->>'id')::uuid;
  booking travelbuddy_backend.scheduled_bookings;
  review_id uuid;
  average_rating numeric;
  review_count bigint;
BEGIN
  IF rating IS NULL OR rating NOT BETWEEN 1 AND 5 OR body IS NULL OR length(trim(body)) NOT BETWEEN 20 AND 1000 THEN
    RAISE EXCEPTION 'Enter a rating from 1 to 5 and a review between 20 and 1000 characters.';
  END IF;

  SELECT b.* INTO booking
  FROM travelbuddy_backend.scheduled_bookings b
  JOIN travelbuddy_backend.booking_orders o ON o.id = b.order_id
  WHERE b.id = submit_review.booking_id AND o.traveler_id = owner_id
  FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.' USING ERRCODE = '42501'; END IF;
  IF booking.status <> 'confirmed' OR (((booking.date + booking.time::time) AT TIME ZONE 'Asia/Colombo')
    + make_interval(secs => substring(booking.snapshot->>'duration' FROM '^[0-9.]+')::double precision
      * CASE WHEN booking.snapshot->>'duration' LIKE '%minute%' THEN 60 ELSE 3600 END) <= now()) IS NOT TRUE THEN
    RAISE EXCEPTION 'You can review a booking after the experience is complete.';
  END IF;

  -- Serialize writes for this package so the visible aggregate stays consistent.
  PERFORM 1 FROM travelbuddy_backend.packages p WHERE p.id = booking.package_id FOR UPDATE;
  INSERT INTO travelbuddy_backend.booking_reviews(booking_id, package_id, traveler_id, rating, body)
  VALUES (booking.id, booking.package_id, owner_id, rating, trim(body))
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO review_id;
  IF review_id IS NULL THEN RAISE EXCEPTION 'This booking already has a review.' USING ERRCODE = '23505'; END IF;

  SELECT round(avg(r.rating)::numeric, 2), count(*)
  INTO average_rating, review_count
  FROM travelbuddy_backend.booking_reviews r
  WHERE r.package_id = booking.package_id;

  UPDATE travelbuddy_backend.packages p
  SET rating = average_rating::double precision,
      data = p.data || jsonb_build_object('rating', average_rating, 'reviews', review_count)
  WHERE p.id = booking.package_id;

  RETURN jsonb_build_object(
    'id', review_id,
    'bookingId', booking.id,
    'experienceId', booking.package_id,
    'rating', rating,
    'body', trim(body),
    'createdAt', clock_timestamp(),
    'aggregate', jsonb_build_object('rating', average_rating, 'reviews', review_count)
  );
END $$;

ALTER FUNCTION travelbuddy_private.review_dashboard() OWNER TO travelbuddy_api_executor;
ALTER FUNCTION travelbuddy_private.experience_reviews(text) OWNER TO travelbuddy_api_executor;
ALTER FUNCTION travelbuddy_private.submit_review(uuid, integer, text) OWNER TO travelbuddy_api_executor;

CREATE FUNCTION travelbuddy_api.review_dashboard() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.review_dashboard() $$;
CREATE FUNCTION travelbuddy_api.experience_reviews(package_id text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.experience_reviews(package_id) $$;
CREATE FUNCTION travelbuddy_api.submit_review(booking_id uuid, rating integer, body text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.submit_review(booking_id, rating, body) $$;

REVOKE ALL ON FUNCTION travelbuddy_private.review_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.experience_reviews(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.submit_review(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.review_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.experience_reviews(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.submit_review(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_private.review_dashboard(), travelbuddy_api.review_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_private.experience_reviews(text), travelbuddy_api.experience_reviews(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_private.submit_review(uuid, integer, text), travelbuddy_api.submit_review(uuid, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
