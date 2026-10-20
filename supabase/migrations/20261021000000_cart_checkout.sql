-- Account-owned cart selections. Cart rows do not reserve inventory.
CREATE TABLE travelbuddy_backend.cart_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 traveler_id uuid NOT NULL REFERENCES travelbuddy_backend.accounts(id) ON DELETE CASCADE,
 package_id text NOT NULL REFERENCES travelbuddy_backend.packages(id) ON DELETE RESTRICT,
 option_index int NOT NULL CHECK (option_index BETWEEN 0 AND 7),
 booking_date date NOT NULL,
 start_time varchar(5) NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 travelers int NOT NULL CHECK (travelers BETWEEN 1 AND 12),
 order_id uuid REFERENCES travelbuddy_backend.booking_orders(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cart_items_active_selection_key
 ON travelbuddy_backend.cart_items(traveler_id,package_id,option_index,booking_date,start_time)
 WHERE order_id IS NULL;
CREATE INDEX cart_items_traveler_created_idx
 ON travelbuddy_backend.cart_items(traveler_id,created_at,id)
 WHERE order_id IS NULL;
CREATE INDEX cart_items_order_idx ON travelbuddy_backend.cart_items(order_id);
ALTER TABLE travelbuddy_backend.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_executor_access ON travelbuddy_backend.cart_items TO travelbuddy_api_executor USING (true) WITH CHECK (true);
REVOKE ALL ON travelbuddy_backend.cart_items FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON travelbuddy_backend.cart_items TO travelbuddy_api_executor;

CREATE FUNCTION travelbuddy_private.cart() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); result jsonb;
BEGIN
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete your account before using the cart.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
   'items',coalesce(jsonb_agg(jsonb_build_object(
     'id',c.id,'experienceId',p.id,'option',c.option_index,'date',c.booking_date,'time',c.start_time,'travelers',c.travelers,
     'unitPrice',round(coalesce((p.data->'options'->c.option_index->>'price')::numeric,p.price)*100)/100,
     'lineTotal',round(coalesce((p.data->'options'->c.option_index->>'price')::numeric,p.price)*100)/100*c.travelers,
     'optionName',p.data->'options'->c.option_index->>'name','experience',travelbuddy_private.package_data(p.data),
     'available',CASE WHEN p.published AND (p.owner_id IS NULL OR host.data->>'status'='active') AND p.data->'options'->c.option_index IS NOT NULL
       THEN EXISTS(SELECT 1 FROM jsonb_array_elements(travelbuddy_private.availability(p.id,c.booking_date,c.option_index,c.travelers)->'slots') s WHERE s->>'time'=c.start_time AND (s->>'remaining')::int>=c.travelers)
       ELSE false END
   ) ORDER BY c.created_at,c.id),'[]'),
   'total',coalesce(sum(round(coalesce((p.data->'options'->c.option_index->>'price')::numeric,p.price)*100)/100*c.travelers),0),
   'itemCount',count(*)
 ) INTO result
 FROM travelbuddy_backend.cart_items c
 JOIN travelbuddy_backend.packages p ON p.id=c.package_id
 LEFT JOIN travelbuddy_backend.accounts host ON host.id=p.owner_id
 WHERE c.traveler_id=(a->>'id')::uuid AND c.order_id IS NULL;
 RETURN result;
END $$;

CREATE FUNCTION travelbuddy_private.cart_add(package_id text, booking_date date, start_time text, option_index int DEFAULT 0, travelers int DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); available jsonb; item_id uuid; owner uuid;
BEGIN
 owner:=(a->>'id')::uuid;
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete your account before using the cart.' USING ERRCODE='42501'; END IF;
 IF package_id IS NULL OR booking_date IS NULL OR start_time IS NULL OR start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR option_index IS NULL OR option_index NOT BETWEEN 0 AND 7 OR travelers IS NULL OR travelers NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'Choose a valid experience, date, time and traveler count.';
 END IF;
 PERFORM travelbuddy_private.package_detail(package_id);
 IF EXISTS(SELECT 1 FROM travelbuddy_backend.packages p WHERE p.id=package_id AND p.owner_id=owner) THEN RAISE EXCEPTION 'You cannot add your own package to the cart.'; END IF;
 available:=travelbuddy_private.availability(package_id,booking_date,option_index,travelers);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(available->'slots') s WHERE s->>'time'=start_time AND (s->>'remaining')::int>=travelers) THEN
  RAISE EXCEPTION 'That date or start time is no longer available. Choose another time.' USING ERRCODE='P0001';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':cart',0));
 IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.cart_items c WHERE c.traveler_id=owner AND c.package_id=cart_add.package_id AND c.option_index=cart_add.option_index AND c.booking_date=cart_add.booking_date AND c.start_time=cart_add.start_time AND c.order_id IS NULL)
    AND (SELECT count(*) FROM travelbuddy_backend.cart_items c WHERE c.traveler_id=owner AND c.order_id IS NULL)>=20 THEN
  RAISE EXCEPTION 'Your cart can contain at most 20 experience selections.';
 END IF;
 INSERT INTO travelbuddy_backend.cart_items(traveler_id,package_id,option_index,booking_date,start_time,travelers)
 VALUES(owner,package_id,option_index,booking_date,start_time,travelers)
 ON CONFLICT (traveler_id,package_id,option_index,booking_date,start_time) WHERE order_id IS NULL
 DO UPDATE SET travelers=EXCLUDED.travelers,updated_at=now()
 RETURNING id INTO item_id;
 RETURN jsonb_build_object('id',item_id);
END $$;

CREATE FUNCTION travelbuddy_private.cart_update(cart_item_id uuid, travelers int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); item travelbuddy_backend.cart_items; available jsonb;
BEGIN
 IF travelers IS NULL OR travelers NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Choose between 1 and 12 travelers.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended((a->>'id')||':cart',0));
 SELECT * INTO item FROM travelbuddy_backend.cart_items c WHERE c.id=cart_item_id AND c.traveler_id=(a->>'id')::uuid AND c.order_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cart item not found.' USING ERRCODE='P0002'; END IF;
 available:=travelbuddy_private.availability(item.package_id,item.booking_date,item.option_index,travelers);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(available->'slots') s WHERE s->>'time'=item.start_time AND (s->>'remaining')::int>=travelers) THEN
  RAISE EXCEPTION 'Not enough places remain for that selection.' USING ERRCODE='P0001';
 END IF;
 UPDATE travelbuddy_backend.cart_items SET travelers=cart_update.travelers,updated_at=now() WHERE id=item.id;
 RETURN jsonb_build_object('id',item.id,'travelers',travelers);
END $$;

CREATE FUNCTION travelbuddy_private.cart_remove(cart_item_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); removed uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended((a->>'id')||':cart',0));
 DELETE FROM travelbuddy_backend.cart_items c WHERE c.id=cart_item_id AND c.traveler_id=(a->>'id')::uuid AND c.order_id IS NULL RETURNING c.id INTO removed;
 IF removed IS NULL THEN RAISE EXCEPTION 'Cart item not found.' USING ERRCODE='P0002'; END IF;
 RETURN true;
END $$;

CREATE FUNCTION travelbuddy_private.checkout_cart(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb:=travelbuddy_private.account(); owner uuid:=(a->>'id')::uuid; key uuid:=(input->>'idempotencyKey')::uuid;
 order_row travelbuddy_backend.booking_orders; items jsonb; item_ids uuid[]; result jsonb; completed_order_id uuid;
BEGIN
 IF a->>'onboarding'<>'completed' THEN RAISE EXCEPTION 'Complete your account before booking.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Enter valid booking details.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text||':cart',0));
 PERFORM 1 FROM travelbuddy_backend.cart_items c WHERE c.traveler_id=owner AND c.order_id IS NULL ORDER BY c.created_at,c.id FOR UPDATE;
 SELECT coalesce(array_agg(c.id ORDER BY c.created_at,c.id),'{}'),
   jsonb_agg(jsonb_build_object('id',c.id,'experienceId',c.package_id,'option',c.option_index,'date',c.booking_date,'time',c.start_time,'travelers',c.travelers) ORDER BY c.created_at,c.id)
 INTO item_ids,items FROM travelbuddy_backend.cart_items c WHERE c.traveler_id=owner AND c.order_id IS NULL;
 IF items IS NULL THEN
  SELECT * INTO order_row FROM travelbuddy_backend.booking_orders o WHERE o.traveler_id=owner AND o.idempotency_key=key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your cart is empty.' USING ERRCODE='P0002'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',c.id,'experienceId',c.package_id,'option',c.option_index,'date',c.booking_date,'time',c.start_time,'travelers',c.travelers) ORDER BY c.created_at,c.id)
  INTO items FROM travelbuddy_backend.cart_items c WHERE c.traveler_id=owner AND c.order_id=order_row.id;
  IF items IS NULL THEN RAISE EXCEPTION 'The original cart checkout could not be restored.' USING ERRCODE='P0002'; END IF;
  RETURN travelbuddy_private.checkout(input||jsonb_build_object('items',items));
 END IF;
 result:=travelbuddy_private.checkout(input||jsonb_build_object('items',items));
 completed_order_id:=(result->0->>'orderId')::uuid;
 UPDATE travelbuddy_backend.cart_items SET order_id=completed_order_id,updated_at=now() WHERE id=ANY(item_ids) AND traveler_id=owner AND order_id IS NULL;
 RETURN result;
END $$;

DO $$ DECLARE f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY[
  'travelbuddy_private.cart()'::regprocedure,
  'travelbuddy_private.cart_add(text,date,text,int,int)'::regprocedure,
  'travelbuddy_private.cart_update(uuid,int)'::regprocedure,
  'travelbuddy_private.cart_remove(uuid)'::regprocedure,
  'travelbuddy_private.checkout_cart(jsonb)'::regprocedure
 ] LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO travelbuddy_api_executor',f); END LOOP;
END $$;
REVOKE ALL ON FUNCTION travelbuddy_private.cart() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.cart_add(text,date,text,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.cart_update(uuid,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.cart_remove(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_private.checkout_cart(jsonb) FROM PUBLIC;

CREATE FUNCTION travelbuddy_api.cart() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.cart() $$;
CREATE FUNCTION travelbuddy_api.cart_add(package_id text, booking_date date, start_time text, option_index int DEFAULT 0, travelers int DEFAULT 1) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.cart_add(package_id,booking_date,start_time,option_index,travelers) $$;
CREATE FUNCTION travelbuddy_api.cart_update(cart_item_id uuid, travelers int) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.cart_update(cart_item_id,travelers) $$;
CREATE FUNCTION travelbuddy_api.cart_remove(cart_item_id uuid) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.cart_remove(cart_item_id) $$;
CREATE FUNCTION travelbuddy_api.checkout_cart(input jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT travelbuddy_private.checkout_cart(input) $$;
REVOKE ALL ON FUNCTION travelbuddy_api.cart() FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.cart_add(text,date,text,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.cart_update(uuid,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.cart_remove(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION travelbuddy_api.checkout_cart(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION travelbuddy_api.cart(),travelbuddy_api.cart_add(text,date,text,int,int),travelbuddy_api.cart_update(uuid,int),travelbuddy_api.cart_remove(uuid),travelbuddy_api.checkout_cart(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION travelbuddy_private.cart(),travelbuddy_private.cart_add(text,date,text,int,int),travelbuddy_private.cart_update(uuid,int),travelbuddy_private.cart_remove(uuid),travelbuddy_private.checkout_cart(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
