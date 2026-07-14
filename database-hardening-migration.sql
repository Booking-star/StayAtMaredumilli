-- 1. Create Performance Indexes on Foreign Keys
CREATE INDEX IF NOT EXISTS bookings_room_id_idx ON public.bookings(room_id);
CREATE INDEX IF NOT EXISTS bookings_influencer_id_idx ON public.bookings(influencer_id);
CREATE INDEX IF NOT EXISTS booking_holds_room_id_idx ON public.booking_holds(room_id);
CREATE INDEX IF NOT EXISTS booking_holds_influencer_id_idx ON public.booking_holds(influencer_id);
CREATE INDEX IF NOT EXISTS rooms_owner_id_idx ON public.rooms(owner_id);
CREATE INDEX IF NOT EXISTS invite_codes_hotel_id_idx ON public.invite_codes(hotel_id);

-- 2. Configure search_path on SECURITY DEFINER Functions to Prevent Search Path Hijacking
ALTER FUNCTION public.attach_booking_payment_screenshot SET search_path = public, pg_catalog;
ALTER FUNCTION public.increment_influencer_visits SET search_path = public, pg_catalog;
ALTER FUNCTION public.resolve_influencer_ref SET search_path = public, pg_catalog;
ALTER FUNCTION public.create_booking_safe SET search_path = public, pg_catalog;
ALTER FUNCTION public.create_booking_hold_safe SET search_path = public, pg_catalog;
ALTER FUNCTION public.upsert_customer_profile SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_new_user SET search_path = public, pg_catalog;
ALTER FUNCTION public.admin_create_owner SET search_path = public, pg_catalog;
ALTER FUNCTION public.set_manual_booking_payment_status SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_dynamic_pricing SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_owner_auth SET search_path = public, pg_catalog;
ALTER FUNCTION public.confirm_booking_hold_safe SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_admin SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_hotel_owner_def SET search_path = public, pg_catalog;
ALTER FUNCTION public.rls_auto_enable SET search_path = public, pg_catalog;

-- 3. Revoke Execute Privileges from Public/Anon on Sensitive Admin Functions
REVOKE EXECUTE ON FUNCTION public.admin_create_owner FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_owner_auth FROM public, anon;
