-- Run private API functions as a dedicated, non-login, non-bypass role.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='travelbuddy_api_executor') THEN CREATE ROLE travelbuddy_api_executor NOLOGIN NOINHERIT NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA travelbuddy_backend,travelbuddy_private,auth,extensions TO travelbuddy_api_executor;
GRANT SELECT,INSERT,UPDATE ON travelbuddy_backend.accounts,travelbuddy_backend.conversations,travelbuddy_backend.messages TO travelbuddy_api_executor;
GRANT SELECT,INSERT ON travelbuddy_backend.booking_orders TO travelbuddy_api_executor;
GRANT SELECT,INSERT,UPDATE ON travelbuddy_backend.scheduled_bookings TO travelbuddy_api_executor;
GRANT SELECT ON travelbuddy_backend.packages,travelbuddy_backend.media_assets TO travelbuddy_api_executor;
GRANT UPDATE(id) ON travelbuddy_backend.packages TO travelbuddy_api_executor;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accounts','conversations','messages','booking_orders','scheduled_bookings','packages','media_assets'] LOOP
 EXECUTE format('CREATE POLICY api_executor_access ON travelbuddy_backend.%I TO travelbuddy_api_executor USING (true) WITH CHECK (true)',t);
 END LOOP;
END $$;
-- Completion uses the original booking snapshot, even if the package is edited.
CREATE OR REPLACE FUNCTION travelbuddy_private.booking_data(b travelbuddy_backend.scheduled_bookings) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT jsonb_build_object('id',b.id,'orderId',b.order_id,'experienceId',b.package_id,'option',b.option_index,'date',b.date,'time',b.time,'travelers',b.travelers,'total',b.total,'travelerName',b.traveler_name,'travelerEmail',b.traveler_email,'created',b.created_at,'reference','TB-'||upper(left(b.id::text,8)),'experience',travelbuddy_private.package_data(b.snapshot),'status',CASE WHEN b.status='cancelled' THEN 'Cancelled' WHEN ((b.date+b.time::time) AT TIME ZONE 'Asia/Colombo')+make_interval(secs=>substring(b.snapshot->>'duration' FROM '^[0-9.]+')::double precision*CASE WHEN b.snapshot->>'duration' LIKE '%minute%' THEN 60 ELSE 3600 END)<=now() THEN 'Completed' ELSE 'Upcoming' END)
$$;
GRANT CREATE ON SCHEMA travelbuddy_private TO travelbuddy_api_executor;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='travelbuddy_private' LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO travelbuddy_api_executor',f.signature);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA travelbuddy_private FROM travelbuddy_api_executor;
ALTER TABLE IF EXISTS travelbuddy_private.api_migrations ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst,'reload schema';
