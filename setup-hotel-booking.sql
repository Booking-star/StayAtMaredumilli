-- ==========================================
-- HOTEL & RESORT BOOKING SYSTEM SETUP SCRIPT
-- Clean database structure (schema only, no live data)
-- ==========================================

-- 1. ENABLE REQUIRED EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. CREATE CUSTOM ENUMS
CREATE TYPE public.user_role AS ENUM ('customer', 'owner', 'admin');
CREATE TYPE public.weekend_policy_type AS ENUM ('mon_thu', 'mon_fri');

-- 3. CREATE CORE TABLES

-- Site Settings
CREATE TABLE public.site_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Highlights
CREATE TABLE public.highlights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    image_url text NOT NULL,
    active boolean DEFAULT true NOT NULL
);

-- Influencers
CREATE TABLE public.influencers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now(),
    name text NOT NULL,
    code text UNIQUE NOT NULL,
    visits integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL
);

-- Hotel Owners (linked to auth.users)
CREATE TABLE public.hotel_owners (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_name text NOT NULL,
    phone text,
    active boolean DEFAULT true NOT NULL,
    hotel_name text,
    alt_phone text,
    weekend_policy public.weekend_policy_type DEFAULT 'mon_fri'::public.weekend_policy_type
);

-- Profiles (synchronized with auth.users)
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    full_name text,
    phone text,
    alt_phone text,
    hotel_name text
);

-- Customer Profiles (synchronized with auth.users)
CREATE TABLE public.customer_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    email text,
    phone text
);

-- Rooms
CREATE TABLE public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    room_name text NOT NULL,
    room_type text NOT NULL,
    available_rooms integer DEFAULT 0 NOT NULL,
    max_adults integer DEFAULT 1 NOT NULL,
    weekday_price integer DEFAULT 0 NOT NULL,
    weekend_price integer DEFAULT 0 NOT NULL,
    amenities text[] DEFAULT '{}'::text[] not null,
    special_attention text DEFAULT ''::text,
    image_urls text[] DEFAULT '{}'::text[] not null,
    active boolean DEFAULT true NOT NULL,
    owner_id uuid REFERENCES public.hotel_owners(id) ON DELETE SET NULL,
    weekday_owner_price integer DEFAULT 0,
    weekend_owner_price integer DEFAULT 0,
    weekend_policy text DEFAULT 'mon_fri'::text NOT NULL
);

-- Bookings
CREATE TABLE public.bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    check_in date NOT NULL,
    check_out date NOT NULL,
    num_rooms integer DEFAULT 1 NOT NULL,
    num_adults integer DEFAULT 1 NOT NULL,
    num_kids integer DEFAULT 0 NOT NULL,
    total_price integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    payment_option text,
    payment_id text,
    owner_amount integer DEFAULT 0,
    profit_amount integer DEFAULT 0,
    influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
    booking_confirmation_status text DEFAULT 'not_contacted'::text NOT NULL,
    last_contact_attempt_at timestamp with time zone,
    payment_screenshot_url text,
    manual_payment_status text DEFAULT 'not_required'::text NOT NULL,
    firecamp boolean DEFAULT false NOT NULL,
    confirmation_email_sent_at timestamp with time zone
);

-- Booking Holds
CREATE TABLE public.booking_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    check_in date NOT NULL,
    check_out date NOT NULL,
    num_rooms integer DEFAULT 1 NOT NULL,
    num_adults integer DEFAULT 1 NOT NULL,
    num_kids integer DEFAULT 0 NOT NULL,
    total_price integer DEFAULT 0 NOT NULL,
    payable_amount integer DEFAULT 0 NOT NULL,
    owner_amount integer DEFAULT 0 NOT NULL,
    profit_amount integer DEFAULT 0 NOT NULL,
    payment_option text DEFAULT '20'::text NOT NULL,
    influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
    firecamp boolean DEFAULT false NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    status text DEFAULT 'held'::text NOT NULL
);

-- 4. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- 5. PROCEDURAL FUNCTIONS

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') = 'admin@staymaredumilli.com'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- Trigger to handle new auth users signing up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone, alt_phone, hotel_name)
  VALUES (
    new.id,
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'customer'::public.user_role),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'alt_phone',
    new.raw_user_meta_data->>'hotel_name'
  );
  RETURN new;
END;
$$;

-- Get dynamic pricing surcharge settings
CREATE OR REPLACE FUNCTION public.get_dynamic_pricing()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (SELECT value FROM public.site_settings WHERE key = 'dynamic_pricing'),
    '{"occupancy80Surcharge": 200, "occupancy90Surcharge": 300}'::jsonb
  );
$$;

-- Upsert customer profile metadata
CREATE OR REPLACE FUNCTION public.upsert_customer_profile(
  p_name text,
  p_email text,
  p_phone text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.customer_profiles (id, name, email, phone, last_seen_at)
  VALUES (auth.uid(), nullif(p_name, ''), nullif(p_email, ''), nullif(p_phone, ''), now())
  ON CONFLICT (id) DO UPDATE SET
    name = coalesce(nullif(excluded.name, ''), customer_profiles.name),
    email = coalesce(nullif(excluded.email, ''), customer_profiles.email),
    phone = coalesce(nullif(excluded.phone, ''), customer_profiles.phone),
    last_seen_at = now();
$$;

-- Admin function to create owner accounts in auth.users
CREATE OR REPLACE FUNCTION public.admin_create_owner(
  new_email text,
  new_password text,
  o_name text,
  o_phone text,
  a_phone text,
  h_name text,
  w_policy text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO new_user_id FROM auth.users WHERE email = new_email;
  IF new_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'A user with email % already exists.', new_email;
  END IF;

  new_user_id := gen_random_uuid();

  -- 1. Insert directly into auth.users with all GoTrue default values
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    is_sso_user,
    role,
    aud,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    phone_change_token,
    reauthentication_token,
    email_change,
    phone_change
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    new_email,
    crypt(new_password, gen_salt('bf', 10)),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    json_build_object('role', 'owner', 'full_name', o_name, 'phone', o_phone, 'alt_phone', a_phone, 'hotel_name', h_name)::jsonb,
    false,
    now(),
    now(),
    false,
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  );

  -- 2. Insert into public.hotel_owners profile
  INSERT INTO public.hotel_owners (
    id,
    hotel_name,
    owner_name,
    phone,
    alt_phone,
    weekend_policy,
    active
  ) VALUES (
    new_user_id,
    h_name,
    o_name,
    o_phone,
    a_phone,
    w_policy::public.weekend_policy_type,
    true
  );

  RETURN new_user_id;
END;
$$;

-- Admin function to update owner credentials
CREATE OR REPLACE FUNCTION public.update_owner_auth(
  user_id uuid,
  new_email text,
  new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update email if provided
  IF new_email IS NOT NULL AND new_email != '' THEN
    UPDATE auth.users
    SET email = new_email,
        email_confirmed_at = now(),
        raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{email}', to_jsonb(new_email))
    WHERE id = user_id;
  END IF;

  -- Update password if provided
  IF new_password IS NOT NULL AND new_password != '' THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf'))
    WHERE id = user_id;
  END IF;
END;
$$;

-- Resolve influencer referral code to ID
CREATE OR REPLACE FUNCTION public.resolve_influencer_ref(
  ref_code text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.influencers
  WHERE lower(code) = lower(ref_code)
    AND active = true
  LIMIT 1;
$$;

-- Increment influencer referral visit counts
CREATE OR REPLACE FUNCTION public.increment_influencer_visits(
  ref_code text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.influencers
  SET visits = visits + 1
  WHERE lower(code) = lower(ref_code)
    AND active = true;
$$;

-- Create booking safely checking room availability
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_check_in date,
  p_check_out date,
  p_num_rooms integer,
  p_num_adults integer,
  p_num_kids integer,
  p_status text,
  p_payment_option text,
  p_influencer_id uuid,
  p_firecamp boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room public.rooms%rowtype;
  v_booking_id uuid;
  v_day date;
  v_booked integer;
  v_held integer;
  v_website_total integer := 0;
  v_owner_total integer := 0;
  v_web_price integer;
  v_owner_price integer;
  v_occ numeric;
  v_80 integer := 200;
  v_90 integer := 300;
BEGIN
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'Check-out must be after check-in.';
  END IF;
  IF p_num_rooms < 1 THEN
    RAISE EXCEPTION 'Select at least one room.';
  END IF;
  IF p_num_adults < 1 OR p_num_kids < 0 THEN
    RAISE EXCEPTION 'Enter a valid guest count.';
  END IF;
  IF p_status NOT IN ('confirmed', 'offline_blocked', 'pending_payment') THEN
    RAISE EXCEPTION 'Invalid booking status.';
  END IF;
  IF p_status IN ('confirmed', 'pending_payment')
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND NOT public.is_admin()
     AND COALESCE(auth.jwt() ->> 'email', '') <> COALESCE(p_customer_email, '') THEN
    RAISE EXCEPTION 'You cannot create a booking for another customer.';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room is not available.';
  END IF;

  IF p_status = 'offline_blocked'
     AND NOT (public.is_admin() OR v_room.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'You cannot block this room.';
  END IF;

  IF p_status IN ('confirmed', 'pending_payment') AND p_num_adults > p_num_rooms * v_room.max_adults THEN
    RAISE EXCEPTION 'Guest count exceeds room capacity.';
  END IF;

  SELECT
    coalesce((value ->> 'occupancy80Surcharge')::integer, 200),
    coalesce((value ->> 'occupancy90Surcharge')::integer, 300)
  INTO v_80, v_90
  FROM public.site_settings
  WHERE key = 'dynamic_pricing';

  FOR v_day IN
    SELECT generate_series(p_check_in, p_check_out - 1, interval '1 day')::date
  LOOP
    SELECT coalesce(sum(num_rooms), 0)::integer
    INTO v_booked
    FROM public.bookings
    WHERE room_id = p_room_id
      AND status <> 'cancelled'
      AND check_in <= v_day
      AND check_out > v_day;

    SELECT coalesce(sum(num_rooms), 0)::integer
    INTO v_held
    FROM public.booking_holds
    WHERE room_id = p_room_id
      AND status = 'held'
      AND expires_at > now()
      AND check_in <= v_day
      AND check_out > v_day;

    IF v_booked + v_held + p_num_rooms > v_room.available_rooms THEN
      RAISE EXCEPTION 'Only % room(s) are available for the selected dates.', greatest(v_room.available_rooms - v_booked - v_held, 0);
    END IF;

    IF (v_room.weekend_policy::text = 'mon_thu' AND extract(dow FROM v_day) IN (0, 5, 6))
       OR (v_room.weekend_policy::text <> 'mon_thu' AND extract(dow FROM v_day) IN (0, 6)) THEN
      v_web_price := coalesce(v_room.weekend_price, v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekend_owner_price, v_room.weekday_owner_price, 0);
    ELSE
      v_web_price := coalesce(v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekday_owner_price, 0);
    END IF;

    v_occ := CASE WHEN v_room.available_rooms > 0 THEN (v_booked + v_held)::numeric / v_room.available_rooms ELSE 0 END;
    v_website_total := v_website_total + v_web_price + CASE WHEN v_occ >= 0.9 THEN v_90 WHEN v_occ >= 0.8 THEN v_80 ELSE 0 END;
    v_owner_total := v_owner_total + v_owner_price;
  END LOOP;

  v_website_total := v_website_total * p_num_rooms;
  v_owner_total := v_owner_total * p_num_rooms;

  IF p_firecamp AND EXISTS (SELECT 1 FROM unnest(v_room.amenities) item WHERE item ILIKE '%firecamp%') THEN
    v_website_total := v_website_total + CASE WHEN p_num_rooms <= 2 THEN 600 ELSE 1000 END;
  END IF;

  INSERT INTO public.bookings (
    room_id, customer_name, customer_phone, customer_email, check_in, check_out,
    num_rooms, num_adults, num_kids, total_price, owner_amount, profit_amount,
    status, payment_option, influencer_id, firecamp
  )
  VALUES (
    p_room_id, coalesce(nullif(p_customer_name, ''), 'Customer'), coalesce(nullif(p_customer_phone, ''), 'N/A'),
    nullif(p_customer_email, ''), p_check_in, p_check_out, p_num_rooms, p_num_adults, p_num_kids,
    v_website_total, v_owner_total, v_website_total - v_owner_total, p_status, p_payment_option, p_influencer_id, p_firecamp
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

-- Create room hold safely before final checkout payment
CREATE OR REPLACE FUNCTION public.create_booking_hold_safe(
  p_room_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_check_in date,
  p_check_out date,
  p_num_rooms integer,
  p_num_adults integer,
  p_num_kids integer,
  p_payment_option text,
  p_influencer_id uuid,
  p_firecamp boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room public.rooms%rowtype;
  v_hold_id uuid;
  v_day date;
  v_booked integer;
  v_held integer;
  v_website_total integer := 0;
  v_owner_total integer := 0;
  v_web_price integer;
  v_owner_price integer;
  v_occ numeric;
  v_80 integer := 200;
  v_90 integer := 300;
  v_payment integer := CASE WHEN p_payment_option = '100' THEN 100 ELSE 20 END;
  v_payable integer;
  v_expires_at timestamptz := now() + interval '5 minutes';
BEGIN
  IF p_check_out <= p_check_in THEN RAISE EXCEPTION 'Check-out must be after check-in.'; END IF;
  IF p_num_rooms < 1 THEN RAISE EXCEPTION 'Select at least one room.'; END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room is not available.'; END IF;
  IF p_num_adults > p_num_rooms * v_room.max_adults THEN RAISE EXCEPTION 'Guest count exceeds room capacity.'; END IF;

  SELECT
    coalesce((value ->> 'occupancy80Surcharge')::integer, 200),
    coalesce((value ->> 'occupancy90Surcharge')::integer, 300)
  INTO v_80, v_90
  FROM public.site_settings
  WHERE key = 'dynamic_pricing';

  FOR v_day IN SELECT generate_series(p_check_in, p_check_out - 1, interval '1 day')::date LOOP
    SELECT coalesce(sum(num_rooms), 0)::integer INTO v_booked
    FROM public.bookings
    WHERE room_id = p_room_id
      AND status <> 'cancelled'
      AND check_in <= v_day
      AND check_out > v_day;

    SELECT coalesce(sum(num_rooms), 0)::integer INTO v_held
    FROM public.booking_holds
    WHERE room_id = p_room_id
      AND status = 'held'
      AND expires_at > now()
      AND check_in <= v_day
      AND check_out > v_day;

    IF v_booked + v_held + p_num_rooms > v_room.available_rooms THEN
      RAISE EXCEPTION 'Only % room(s) are available for the selected dates.', greatest(v_room.available_rooms - v_booked - v_held, 0);
    END IF;

    IF (v_room.weekend_policy::text = 'mon_thu' AND extract(dow FROM v_day) IN (0, 5, 6))
       OR (v_room.weekend_policy::text <> 'mon_thu' AND extract(dow FROM v_day) IN (0, 6)) THEN
      v_web_price := coalesce(v_room.weekend_price, v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekend_owner_price, v_room.weekday_owner_price, 0);
    ELSE
      v_web_price := coalesce(v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekday_owner_price, 0);
    END IF;

    v_occ := CASE WHEN v_room.available_rooms > 0 THEN (v_booked + v_held)::numeric / v_room.available_rooms ELSE 0 END;
    v_website_total := v_website_total + v_web_price + CASE WHEN v_occ >= 0.9 THEN v_90 WHEN v_occ >= 0.8 THEN v_80 ELSE 0 END;
    v_owner_total := v_owner_total + v_owner_price;
  END LOOP;

  v_website_total := v_website_total * p_num_rooms;
  v_owner_total := v_owner_total * p_num_rooms;
  IF p_firecamp AND EXISTS (SELECT 1 FROM unnest(v_room.amenities) item WHERE item ILIKE '%firecamp%') THEN
    v_website_total := v_website_total + CASE WHEN p_num_rooms <= 2 THEN 600 ELSE 1000 END;
  END IF;
  v_payable := ceil(v_website_total * v_payment / 100.0)::integer;

  INSERT INTO public.booking_holds (
    room_id, customer_name, customer_phone, customer_email, check_in, check_out,
    num_rooms, num_adults, num_kids, total_price, payable_amount, owner_amount,
    profit_amount, payment_option, influencer_id, firecamp, expires_at
  )
  VALUES (
    p_room_id, coalesce(nullif(p_customer_name, ''), 'Customer'), coalesce(nullif(p_customer_phone, ''), 'N/A'),
    nullif(p_customer_email, ''), p_check_in, p_check_out, p_num_rooms, p_num_adults, p_num_kids,
    v_website_total, v_payable, v_owner_total, v_website_total - v_owner_total,
    v_payment::text, p_influencer_id, p_firecamp, v_expires_at
  )
  RETURNING id INTO v_hold_id;

  RETURN jsonb_build_object(
    'hold_id', v_hold_id,
    'total_amount', v_website_total,
    'payable_amount', v_payable,
    'expires_at', v_expires_at
  );
END;
$$;

-- Confirm reservation hold after successful payment authorization
CREATE OR REPLACE FUNCTION public.confirm_booking_hold_safe(
  p_hold_id uuid,
  p_razorpay_payment_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hold public.booking_holds%rowtype;
  v_room public.rooms%rowtype;
  v_booking_id uuid;
  v_day date;
  v_booked integer;
  v_held integer;
BEGIN
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE payment_id = p_razorpay_payment_id
  LIMIT 1;

  IF v_booking_id IS NOT NULL THEN
    RETURN v_booking_id;
  END IF;

  SELECT * INTO v_hold
  FROM public.booking_holds
  WHERE id = p_hold_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Payment hold not found.'; END IF;
  IF v_hold.status NOT IN ('held', 'expired') THEN RAISE EXCEPTION 'Payment hold is no longer active.'; END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = v_hold.room_id AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room is not available.'; END IF;

  FOR v_day IN SELECT generate_series(v_hold.check_in, v_hold.check_out - 1, interval '1 day')::date LOOP
    SELECT coalesce(sum(num_rooms), 0)::integer INTO v_booked
    FROM public.bookings
    WHERE room_id = v_hold.room_id
      AND status <> 'cancelled'
      AND check_in <= v_day
      AND check_out > v_day;

    SELECT coalesce(sum(num_rooms), 0)::integer INTO v_held
    FROM public.booking_holds
    WHERE id <> v_hold.id
      AND room_id = v_hold.room_id
      AND status = 'held'
      AND expires_at > now()
      AND check_in <= v_day
      AND check_out > v_day;

    IF v_booked + v_held + v_hold.num_rooms > v_room.available_rooms THEN
      RAISE EXCEPTION 'Room is no longer available for the selected dates.';
    END IF;
  END LOOP;

  INSERT INTO public.bookings (
    room_id, customer_name, customer_phone, customer_email, check_in, check_out,
    num_rooms, num_adults, num_kids, total_price, owner_amount, profit_amount,
    status, payment_option, payment_id, influencer_id, firecamp
  )
  VALUES (
    v_hold.room_id, v_hold.customer_name, v_hold.customer_phone, v_hold.customer_email,
    v_hold.check_in, v_hold.check_out, v_hold.num_rooms, v_hold.num_adults, v_hold.num_kids,
    v_hold.total_price, v_hold.owner_amount, v_hold.profit_amount, 'confirmed',
    v_hold.payment_option, p_razorpay_payment_id, v_hold.influencer_id, v_hold.firecamp
  )
  RETURNING id INTO v_booking_id;

  UPDATE public.booking_holds
  SET status = 'confirmed', razorpay_payment_id = p_razorpay_payment_id
  WHERE id = p_hold_id;

  RETURN v_booking_id;
END;
$$;

-- Attach booking payment screenshot
CREATE OR REPLACE FUNCTION public.attach_booking_payment_screenshot(
  p_booking_id uuid,
  p_screenshot_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF nullif(p_screenshot_url, '') IS NULL THEN
    RAISE EXCEPTION 'Payment screenshot is required.';
  END IF;

  UPDATE public.bookings
  SET payment_screenshot_url = p_screenshot_url,
      manual_payment_status = 'submitted'
  WHERE id = p_booking_id
    AND (
      public.is_admin()
      OR customer_email = (auth.jwt() ->> 'email')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found for this user.';
  END IF;
END;
$$;

-- Verify manual booking payment (Admin only)
CREATE OR REPLACE FUNCTION public.set_manual_booking_payment_status(
  p_booking_id uuid,
  p_confirm boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only.';
  END IF;

  UPDATE public.bookings
  SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'cancelled' END,
      manual_payment_status = CASE WHEN p_confirm THEN 'verified' ELSE 'rejected' END,
      booking_confirmation_status = CASE WHEN p_confirm THEN booking_confirmation_status ELSE 'confirmed_not_coming' END,
      last_contact_attempt_at = now()
  WHERE id = p_booking_id
    AND status = 'pending_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending manual payment booking not found.';
  END IF;
END;
$$;

-- 6. TRIGGERS CONNECTION
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. ROW LEVEL SECURITY POLICIES

-- profiles
CREATE POLICY "profiles admin read" ON public.profiles 
    FOR SELECT TO authenticated 
    USING (public.is_admin() OR (id = auth.uid()));

-- customer_profiles
CREATE POLICY "customer_profiles admin read" ON public.customer_profiles 
    FOR SELECT TO authenticated 
    USING (public.is_admin() OR (id = auth.uid()));

-- site_settings
CREATE POLICY "site_settings admin write" ON public.site_settings 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

-- highlights
CREATE POLICY "highlights public read" ON public.highlights 
    FOR SELECT TO public 
    USING (active = true);

CREATE POLICY "highlights admin write" ON public.highlights 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

-- influencers
CREATE POLICY "influencers select admin" ON public.influencers 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY "influencers admin write" ON public.influencers 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

-- hotel_owners
CREATE POLICY "hotel_owners select" ON public.hotel_owners 
    FOR SELECT TO authenticated 
    USING (public.is_admin() OR (id = auth.uid()));

CREATE POLICY "hotel_owners admin write" ON public.hotel_owners 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

-- rooms
CREATE POLICY "rooms owner read" ON public.rooms 
    FOR SELECT TO authenticated 
    USING (public.is_admin() OR (owner_id = auth.uid()));

CREATE POLICY "rooms admin write" ON public.rooms 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

-- bookings
CREATE POLICY "bookings admin all" ON public.bookings 
    FOR ALL TO authenticated 
    USING (public.is_admin()) 
    WITH CHECK (public.is_admin());

CREATE POLICY "bookings customer read" ON public.bookings 
    FOR SELECT TO authenticated 
    USING (customer_email = (auth.jwt() ->> 'email'::text));

CREATE POLICY "bookings owner read" ON public.bookings 
    FOR SELECT TO authenticated 
    USING (EXISTS (
        SELECT 1 FROM public.rooms 
        WHERE rooms.id = bookings.room_id AND rooms.owner_id = auth.uid()
    ));

CREATE POLICY "bookings owner update" ON public.bookings 
    FOR UPDATE TO authenticated 
    USING (EXISTS (
        SELECT 1 FROM public.rooms 
        WHERE rooms.id = bookings.room_id AND rooms.owner_id = auth.uid()
    )) 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.rooms 
        WHERE rooms.id = bookings.room_id AND rooms.owner_id = auth.uid()
    ));

-- 8. SEED BASE DEFAULT CONFIGURATIONS
INSERT INTO public.site_settings (key, value) VALUES
('dynamic_pricing', '{"occupancy80Surcharge": 200, "occupancy90Surcharge": 300}'::jsonb),
('payment', '{"mode": "razorpay", "upiId": "your-upi-id-here@upi"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 9. VIEWS
CREATE VIEW public.rooms_public AS
SELECT
  id,
  created_at,
  room_name,
  room_type,
  available_rooms,
  max_adults,
  weekday_price,
  weekend_price,
  amenities,
  special_attention,
  image_urls,
  active,
  coalesce(weekend_policy::text, 'mon_fri') as weekend_policy
FROM public.rooms
WHERE active = true;

GRANT SELECT ON public.rooms_public TO anon, authenticated;

