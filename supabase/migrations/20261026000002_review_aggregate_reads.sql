-- Review submissions update package.rating and package.data.reviews while
-- holding the package row lock. Read those maintained aggregates directly
-- instead of scanning all reviews whenever a public page is opened.
CREATE OR REPLACE FUNCTION travelbuddy_private.experience_reviews(package_id text)
RETURNS jsonb
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Experience not found.' USING ERRCODE = 'P0002';
  END IF;

  average_rating := coalesce(pack.rating::numeric, 0);
  review_count := coalesce(nullif(pack.data->>'reviews','')::bigint, 0);

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

  RETURN jsonb_build_object(
    'rating', average_rating,
    'reviews', review_count,
    'items', review_list
  );
END $$;

NOTIFY pgrst,'reload schema';
