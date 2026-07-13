create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  room_name text not null,
  room_type text not null,
  available_rooms integer not null default 0,
  max_adults integer not null default 1,
  weekday_price integer not null default 0,
  weekend_price integer not null default 0,
  amenities text[] not null default '{}',
  special_attention text default '',
  image_urls text[] not null default '{}',
  active boolean not null default true
);

alter table public.rooms enable row level security;

drop policy if exists "rooms public read" on public.rooms;
create policy "rooms public read"
on public.rooms for select
using (active = true);

-- Secure authenticated-only write policy.
drop policy if exists "rooms prototype write" on public.rooms;
drop policy if exists "rooms admin write" on public.rooms;
create policy "rooms admin write"
on public.rooms for all
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('room-images', 'room-images', true)
on conflict (id) do update set public = true;

drop policy if exists "room images public read" on storage.objects;
create policy "room images public read"
on storage.objects for select
using (bucket_id = 'room-images');

-- Secure authenticated-only upload/delete policy.
drop policy if exists "room images prototype write" on storage.objects;
drop policy if exists "room images admin write" on storage.objects;
create policy "room images admin write"
on storage.objects for all
to authenticated
using (bucket_id = 'room-images')
with check (bucket_id = 'room-images');

-- Create hotel_owners table
create table if not exists public.hotel_owners (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  owner_name text not null,
  phone text,
  active boolean not null default true
);

-- Enable RLS on hotel_owners
alter table public.hotel_owners enable row level security;

-- Policies for hotel_owners
drop policy if exists "hotel_owners select" on public.hotel_owners;
create policy "hotel_owners select" on public.hotel_owners for select to authenticated using (true);

drop policy if exists "hotel_owners admin write" on public.hotel_owners;
create policy "hotel_owners admin write" on public.hotel_owners for all to authenticated using (true) with check (true);

-- Add owner_id to rooms table
alter table public.rooms add column if not exists owner_id uuid references public.hotel_owners(id);

-- Create bookings table
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  room_id uuid not null references public.rooms(id),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  check_in date not null,
  check_out date not null,
  num_rooms integer not null default 1,
  num_adults integer not null default 1,
  num_kids integer not null default 0,
  total_price integer not null default 0,
  status text not null default 'confirmed', -- 'confirmed', 'cancelled', 'offline_blocked'
  payment_option text,
  payment_id text
);

-- Allow multi-room hotels to have overlapping bookings as long as summed rooms stay within capacity.
alter table public.bookings drop constraint if exists no_overlapping_bookings;
alter table public.bookings drop constraint if exists bookings_no_overlapping_bookings;
alter table public.bookings drop constraint if exists bookings_room_id_check_in_check_out_excl;

-- Enable RLS on bookings
alter table public.bookings enable row level security;

-- Booking policies are defined after public.is_admin() exists.

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings public read" on public.site_settings;

drop policy if exists "site_settings admin write" on public.site_settings;

insert into public.site_settings (key, value)
values ('dynamic_pricing', '{"occupancy80Surcharge": 200, "occupancy90Surcharge": 300}'::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value)
values ('payment', '{"mode": "manual", "upiId": ""}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'owner'
);

alter table public.profiles enable row level security;

alter table public.rooms add column if not exists weekday_owner_price integer not null default 0;
alter table public.rooms add column if not exists weekend_owner_price integer not null default 0;
alter table public.rooms add column if not exists weekend_policy text not null default 'mon_fri';
alter table public.hotel_owners add column if not exists hotel_name text;
alter table public.hotel_owners add column if not exists alt_phone text;
alter table public.hotel_owners add column if not exists weekend_policy text not null default 'mon_fri';
alter table public.bookings add column if not exists owner_amount integer not null default 0;
alter table public.bookings add column if not exists profit_amount integer not null default 0;
alter table public.bookings add column if not exists influencer_id uuid;
alter table public.bookings add column if not exists firecamp boolean not null default false;
alter table public.bookings add column if not exists booking_confirmation_status text not null default 'not_contacted';
alter table public.bookings add column if not exists last_contact_attempt_at timestamptz;
alter table public.bookings add column if not exists payment_screenshot_url text;
alter table public.bookings add column if not exists manual_payment_status text not null default 'not_required';

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  url text not null,
  image_url text not null,
  active boolean not null default true
);

create table if not exists public.influencers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  code text not null unique,
  visits integer not null default 0,
  active boolean not null default true
);

alter table public.highlights enable row level security;
alter table public.influencers enable row level security;
alter table public.highlights add column if not exists active boolean not null default true;
alter table public.influencers add column if not exists active boolean not null default true;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@staymaredumilli.com'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    );
$$;

drop policy if exists "profiles admin read" on public.profiles;
create policy "profiles admin read"
on public.profiles for select
to authenticated
using (public.is_admin() or id = auth.uid());

drop view if exists public.rooms_public;
create view public.rooms_public as
select
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
from public.rooms
where active = true;
grant select on public.rooms_public to anon, authenticated;

drop view if exists public.rooms_with_owner_policy;
create view public.rooms_with_owner_policy
with (security_invoker = true)
as
select
  r.id,
  r.created_at,
  r.room_name,
  r.room_type,
  r.available_rooms,
  r.max_adults,
  r.weekday_price,
  r.weekend_price,
  r.amenities,
  r.special_attention,
  r.image_urls,
  r.active,
  r.owner_id,
  r.weekday_owner_price,
  r.weekend_owner_price,
  coalesce(r.weekend_policy::text, o.weekend_policy::text, 'mon_fri') as weekend_policy
from public.rooms r
left join public.hotel_owners o on o.id = r.owner_id;
revoke all on public.rooms_with_owner_policy from anon;
grant select on public.rooms_with_owner_policy to authenticated;

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  room_id uuid not null references public.rooms(id),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  check_in date not null,
  check_out date not null,
  num_rooms integer not null default 1,
  num_adults integer not null default 1,
  num_kids integer not null default 0,
  total_price integer not null default 0,
  payable_amount integer not null default 0,
  owner_amount integer not null default 0,
  profit_amount integer not null default 0,
  payment_option text not null default '20',
  influencer_id uuid,
  firecamp boolean not null default false,
  razorpay_order_id text,
  razorpay_payment_id text,
  status text not null default 'held'
);

drop view if exists public.booking_occupancy;
create view public.booking_occupancy as
select room_id, check_in, check_out, num_rooms, status
from public.bookings
where status <> 'cancelled'
union all
select room_id, check_in, check_out, num_rooms, status
from public.booking_holds
where status = 'held'
  and expires_at > now();
grant select on public.booking_occupancy to anon, authenticated;

drop policy if exists "rooms admin write" on public.rooms;
drop policy if exists "rooms public read" on public.rooms;
drop policy if exists "rooms owner read" on public.rooms;
create policy "rooms admin write"
on public.rooms for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "rooms owner read"
on public.rooms for select
to authenticated
using (public.is_admin() or owner_id = auth.uid());

drop policy if exists "room images admin write" on storage.objects;
create policy "room images admin write"
on storage.objects for all
to authenticated
using (bucket_id = 'room-images' and public.is_admin())
with check (bucket_id = 'room-images' and public.is_admin());

drop policy if exists "hotel_owners select" on public.hotel_owners;
create policy "hotel_owners select"
on public.hotel_owners for select
to authenticated
using (public.is_admin() or id = auth.uid());

drop policy if exists "hotel_owners admin write" on public.hotel_owners;
create policy "hotel_owners admin write"
on public.hotel_owners for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "bookings owner modify" on public.bookings;
drop policy if exists "bookings public read" on public.bookings;
drop policy if exists "bookings public insert" on public.bookings;
drop policy if exists "bookings admin all" on public.bookings;
drop policy if exists "bookings owner read update" on public.bookings;
drop policy if exists "bookings owner read" on public.bookings;
drop policy if exists "bookings owner update" on public.bookings;
drop policy if exists "bookings customer read" on public.bookings;

create policy "bookings admin all"
on public.bookings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "bookings customer read"
on public.bookings for select
to authenticated
using (customer_email = (auth.jwt() ->> 'email'));

create policy "bookings owner read"
on public.bookings for select
to authenticated
using (
  exists (
    select 1 from public.rooms
    where rooms.id = bookings.room_id
      and rooms.owner_id = auth.uid()
  )
);

create policy "bookings owner update"
on public.bookings for update
to authenticated
using (
  exists (
    select 1 from public.rooms
    where rooms.id = bookings.room_id
      and rooms.owner_id = auth.uid()
  )
)
with check (status = 'cancelled');

revoke select on public.bookings from anon;
grant select on public.bookings to authenticated;
grant update(status, booking_confirmation_status, last_contact_attempt_at) on public.bookings to authenticated;

drop view if exists public.admin_bookings;
create view public.admin_bookings
with (security_invoker = false) as
select
  b.*,
  r.room_name,
  r.room_type,
  coalesce(o.hotel_name, r.room_name) as hotel_name,
  o.owner_name,
  o.phone as owner_phone
from public.bookings b
left join public.rooms r on r.id = b.room_id
left join public.hotel_owners o on o.id = r.owner_id
where public.is_admin();
grant select on public.admin_bookings to authenticated;

drop view if exists public.owner_bookings;
create view public.owner_bookings as
select
  b.id,
  b.room_id,
  b.check_in,
  b.check_out,
  b.num_rooms,
  b.num_adults,
  b.num_kids,
  b.total_price,
  b.owner_amount,
  b.status,
  b.payment_option,
  b.created_at
from public.bookings b
join public.rooms r on r.id = b.room_id
where public.is_admin() or r.owner_id = auth.uid();
grant select on public.owner_bookings to authenticated;

alter view if exists public.hotel_owners_with_auth set (security_invoker = true);
revoke all on public.hotel_owners_with_auth from anon;
grant select on public.hotel_owners_with_auth to authenticated;

drop policy if exists "highlights public read" on public.highlights;
create policy "highlights public read"
on public.highlights for select
using (active = true);

drop policy if exists "highlights admin write" on public.highlights;
create policy "highlights admin write"
on public.highlights for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "influencers public read" on public.influencers;

drop policy if exists "influencers admin write" on public.influencers;
create policy "influencers admin write"
on public.influencers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.increment_influencer_visits(ref_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.influencers
  set visits = visits + 1
  where lower(code) = lower(ref_code)
    and active = true;
$$;

revoke all on function public.increment_influencer_visits(text) from public;
grant execute on function public.increment_influencer_visits(text) to anon, authenticated;

create or replace function public.resolve_influencer_ref(ref_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.influencers
  where lower(code) = lower(ref_code)
    and active = true
  limit 1;
$$;

revoke all on function public.resolve_influencer_ref(text) from public;
grant execute on function public.resolve_influencer_ref(text) to anon, authenticated;

create or replace function public.get_dynamic_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.site_settings where key = 'dynamic_pricing'),
    '{"occupancy80Surcharge": 200, "occupancy90Surcharge": 300}'::jsonb
  );
$$;

revoke all on function public.get_dynamic_pricing() from public;
grant execute on function public.get_dynamic_pricing() to anon, authenticated;

drop policy if exists "site_settings admin write" on public.site_settings;
create policy "site_settings admin write"
on public.site_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.create_booking_safe(
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
  p_status text,
  p_influencer_id uuid default null,
  p_firecamp boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_booking_id uuid;
  v_day date;
  v_booked integer;
  v_website_total integer := 0;
  v_owner_total integer := 0;
  v_web_price integer;
  v_owner_price integer;
  v_occ numeric;
  v_80 integer := 200;
  v_90 integer := 300;
begin
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in.';
  end if;
  if p_num_rooms < 1 then
    raise exception 'Select at least one room.';
  end if;
  if p_status not in ('confirmed', 'offline_blocked', 'pending_payment') then
    raise exception 'Invalid booking status.';
  end if;
  if p_status in ('confirmed', 'pending_payment')
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not public.is_admin()
     and coalesce(auth.jwt() ->> 'email', '') <> coalesce(p_customer_email, '') then
    raise exception 'You cannot create a booking for another customer.';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id and active = true
  for update;

  if not found then
    raise exception 'Room is not available.';
  end if;

  if p_status = 'offline_blocked'
     and not (public.is_admin() or v_room.owner_id = auth.uid()) then
    raise exception 'You cannot block this room.';
  end if;

  if p_status in ('confirmed', 'pending_payment') and p_num_adults > p_num_rooms * v_room.max_adults then
    raise exception 'Guest count exceeds room capacity.';
  end if;

  select
    coalesce((value ->> 'occupancy80Surcharge')::integer, 200),
    coalesce((value ->> 'occupancy90Surcharge')::integer, 300)
  into v_80, v_90
  from public.site_settings
  where key = 'dynamic_pricing';

  for v_day in
    select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date
  loop
    select coalesce(sum(num_rooms), 0)::integer
    into v_booked
    from public.bookings
    where room_id = p_room_id
      and status <> 'cancelled'
      and check_in <= v_day
      and check_out > v_day;

    if v_booked + p_num_rooms > v_room.available_rooms then
      raise exception 'Only % room(s) are available for the selected dates.', greatest(v_room.available_rooms - v_booked, 0);
    end if;

    if (v_room.weekend_policy::text = 'mon_thu' and extract(dow from v_day) in (0, 5, 6))
       or (v_room.weekend_policy::text <> 'mon_thu' and extract(dow from v_day) in (0, 6)) then
      v_web_price := coalesce(v_room.weekend_price, v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekend_owner_price, v_room.weekday_owner_price, 0);
    else
      v_web_price := coalesce(v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekday_owner_price, 0);
    end if;

    v_occ := case when v_room.available_rooms > 0 then v_booked::numeric / v_room.available_rooms else 0 end;
    v_website_total := v_website_total + v_web_price + case when v_occ >= 0.9 then v_90 when v_occ >= 0.8 then v_80 else 0 end;
    v_owner_total := v_owner_total + v_owner_price;
  end loop;

  v_website_total := v_website_total * p_num_rooms;
  v_owner_total := v_owner_total * p_num_rooms;

  if p_firecamp and exists (select 1 from unnest(v_room.amenities) item where item ilike '%firecamp%') then
    v_website_total := v_website_total + case when p_num_rooms <= 2 then 600 else 1000 end;
  end if;

  insert into public.bookings (
    room_id, customer_name, customer_phone, customer_email, check_in, check_out,
    num_rooms, num_adults, num_kids, total_price, owner_amount, profit_amount,
    status, payment_option, influencer_id, firecamp
  )
  values (
    p_room_id, coalesce(nullif(p_customer_name, ''), 'Customer'), coalesce(nullif(p_customer_phone, ''), 'N/A'),
    nullif(p_customer_email, ''), p_check_in, p_check_out, p_num_rooms, p_num_adults, p_num_kids,
    v_website_total, v_owner_total, v_website_total - v_owner_total, p_status, p_payment_option, p_influencer_id, p_firecamp
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

revoke all on function public.create_booking_safe(uuid, text, text, text, date, date, integer, integer, integer, text, text, uuid, boolean) from public;
grant execute on function public.create_booking_safe(uuid, text, text, text, date, date, integer, integer, integer, text, text, uuid, boolean) to authenticated, service_role;

alter table public.booking_holds enable row level security;

drop policy if exists "booking_holds admin all" on public.booking_holds;
create policy "booking_holds admin all"
on public.booking_holds for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.create_booking_hold_safe(
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
  p_influencer_id uuid default null,
  p_firecamp boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_payment integer := case when p_payment_option = '100' then 100 else 20 end;
  v_payable integer;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if p_check_out <= p_check_in then raise exception 'Check-out must be after check-in.'; end if;
  if p_num_rooms < 1 then raise exception 'Select at least one room.'; end if;

  select * into v_room
  from public.rooms
  where id = p_room_id and active = true
  for update;

  if not found then raise exception 'Room is not available.'; end if;
  if p_num_adults > p_num_rooms * v_room.max_adults then raise exception 'Guest count exceeds room capacity.'; end if;

  select
    coalesce((value ->> 'occupancy80Surcharge')::integer, 200),
    coalesce((value ->> 'occupancy90Surcharge')::integer, 300)
  into v_80, v_90
  from public.site_settings
  where key = 'dynamic_pricing';

  for v_day in select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date loop
    select coalesce(sum(num_rooms), 0)::integer into v_booked
    from public.bookings
    where room_id = p_room_id
      and status <> 'cancelled'
      and check_in <= v_day
      and check_out > v_day;

    select coalesce(sum(num_rooms), 0)::integer into v_held
    from public.booking_holds
    where room_id = p_room_id
      and status = 'held'
      and expires_at > now()
      and check_in <= v_day
      and check_out > v_day;

    if v_booked + v_held + p_num_rooms > v_room.available_rooms then
      raise exception 'Only % room(s) are available for the selected dates.', greatest(v_room.available_rooms - v_booked - v_held, 0);
    end if;

    if (v_room.weekend_policy::text = 'mon_thu' and extract(dow from v_day) in (0, 5, 6))
       or (v_room.weekend_policy::text <> 'mon_thu' and extract(dow from v_day) in (0, 6)) then
      v_web_price := coalesce(v_room.weekend_price, v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekend_owner_price, v_room.weekday_owner_price, 0);
    else
      v_web_price := coalesce(v_room.weekday_price, 0);
      v_owner_price := coalesce(v_room.weekday_owner_price, 0);
    end if;

    v_occ := case when v_room.available_rooms > 0 then (v_booked + v_held)::numeric / v_room.available_rooms else 0 end;
    v_website_total := v_website_total + v_web_price + case when v_occ >= 0.9 then v_90 when v_occ >= 0.8 then v_80 else 0 end;
    v_owner_total := v_owner_total + v_owner_price;
  end loop;

  v_website_total := v_website_total * p_num_rooms;
  v_owner_total := v_owner_total * p_num_rooms;
  if p_firecamp and exists (select 1 from unnest(v_room.amenities) item where item ilike '%firecamp%') then
    v_website_total := v_website_total + case when p_num_rooms <= 2 then 600 else 1000 end;
  end if;
  v_payable := ceil(v_website_total * v_payment / 100.0)::integer;

  insert into public.booking_holds (
    room_id, customer_name, customer_phone, customer_email, check_in, check_out,
    num_rooms, num_adults, num_kids, total_price, payable_amount, owner_amount,
    profit_amount, payment_option, influencer_id, firecamp, expires_at
  )
  values (
    p_room_id, coalesce(nullif(p_customer_name, ''), 'Customer'), coalesce(nullif(p_customer_phone, ''), 'N/A'),
    nullif(p_customer_email, ''), p_check_in, p_check_out, p_num_rooms, p_num_adults, p_num_kids,
    v_website_total, v_payable, v_owner_total, v_website_total - v_owner_total,
    v_payment::text, p_influencer_id, p_firecamp, v_expires_at
  )
  returning id into v_hold_id;

  return jsonb_build_object(
    'hold_id', v_hold_id,
    'total_amount', v_website_total,
    'payable_amount', v_payable,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.confirm_booking_hold_safe(
  p_hold_id uuid,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.booking_holds%rowtype;
  v_booking_id uuid;
begin
  select id into v_booking_id
  from public.bookings
  where payment_id = p_razorpay_payment_id
  limit 1;

  if v_booking_id is not null then
    return v_booking_id;
  end if;

  select * into v_hold
  from public.booking_holds
  where id = p_hold_id
  for update;

  if not found then raise exception 'Payment hold not found.'; end if;
  if v_hold.status not in ('held', 'expired') then raise exception 'Payment hold is no longer active.'; end if;

  insert into public.bookings (
    room_id, customer_name, customer_phone, customer_email, check_in, check_out,
    num_rooms, num_adults, num_kids, total_price, owner_amount, profit_amount,
    status, payment_option, payment_id, influencer_id, firecamp
  )
  values (
    v_hold.room_id, v_hold.customer_name, v_hold.customer_phone, v_hold.customer_email,
    v_hold.check_in, v_hold.check_out, v_hold.num_rooms, v_hold.num_adults, v_hold.num_kids,
    v_hold.total_price, v_hold.owner_amount, v_hold.profit_amount, 'confirmed',
    v_hold.payment_option, p_razorpay_payment_id, v_hold.influencer_id, v_hold.firecamp
  )
  returning id into v_booking_id;

  update public.booking_holds
  set status = 'confirmed', razorpay_payment_id = p_razorpay_payment_id
  where id = p_hold_id;

  return v_booking_id;
end;
$$;

revoke all on function public.create_booking_hold_safe(uuid, text, text, text, date, date, integer, integer, integer, text, uuid, boolean) from public;
revoke all on function public.confirm_booking_hold_safe(uuid, text) from public;
grant execute on function public.create_booking_hold_safe(uuid, text, text, text, date, date, integer, integer, integer, text, uuid, boolean) to service_role;
grant execute on function public.confirm_booking_hold_safe(uuid, text) to service_role;

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  name text,
  email text,
  phone text
);

alter table public.customer_profiles enable row level security;

drop policy if exists "customer_profiles admin read" on public.customer_profiles;
create policy "customer_profiles admin read"
on public.customer_profiles for select
to authenticated
using (public.is_admin() or id = auth.uid());

create or replace function public.upsert_customer_profile(p_name text, p_email text, p_phone text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.customer_profiles (id, name, email, phone, last_seen_at)
  values (auth.uid(), nullif(p_name, ''), nullif(p_email, ''), nullif(p_phone, ''), now())
  on conflict (id) do update set
    name = coalesce(nullif(excluded.name, ''), customer_profiles.name),
    email = coalesce(nullif(excluded.email, ''), customer_profiles.email),
    phone = coalesce(nullif(excluded.phone, ''), customer_profiles.phone),
    last_seen_at = now();
$$;

revoke all on function public.upsert_customer_profile(text, text, text) from public;
grant execute on function public.upsert_customer_profile(text, text, text) to authenticated;

create table if not exists public.room_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  room_id uuid references public.rooms(id),
  phone text not null,
  check_in date,
  check_out date,
  status text not null default 'new'
);

alter table public.room_leads enable row level security;

drop policy if exists "room_leads admin all" on public.room_leads;
create policy "room_leads admin all"
on public.room_leads for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.create_room_lead(p_room_id uuid, p_phone text, p_check_in date, p_check_out date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(p_phone, '') is null then raise exception 'Phone number is required.'; end if;
  insert into public.room_leads (room_id, phone, check_in, check_out)
  values (p_room_id, p_phone, p_check_in, p_check_out)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_room_lead(uuid, text, date, date) from public;
grant execute on function public.create_room_lead(uuid, text, date, date) to anon, authenticated;

create or replace function public.attach_booking_payment_screenshot(p_booking_id uuid, p_screenshot_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(p_screenshot_url, '') is null then
    raise exception 'Payment screenshot is required.';
  end if;

  update public.bookings
  set payment_screenshot_url = p_screenshot_url,
      manual_payment_status = 'submitted'
  where id = p_booking_id
    and (
      public.is_admin()
      or customer_email = (auth.jwt() ->> 'email')
    );

  if not found then
    raise exception 'Booking not found for this user.';
  end if;
end;
$$;

revoke all on function public.attach_booking_payment_screenshot(uuid, text) from public;
grant execute on function public.attach_booking_payment_screenshot(uuid, text) to authenticated;

create or replace function public.set_manual_booking_payment_status(p_booking_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.';
  end if;

  update public.bookings
  set status = case when p_confirm then 'confirmed' else 'cancelled' end,
      manual_payment_status = case when p_confirm then 'verified' else 'rejected' end,
      booking_confirmation_status = case when p_confirm then booking_confirmation_status else 'confirmed_not_coming' end,
      last_contact_attempt_at = now()
  where id = p_booking_id
    and status = 'pending_payment';

  if not found then
    raise exception 'Pending manual payment booking not found.';
  end if;
end;
$$;

revoke all on function public.set_manual_booking_payment_status(uuid, boolean) from public;
grant execute on function public.set_manual_booking_payment_status(uuid, boolean) to authenticated;

create or replace function public.get_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.site_settings where key = 'payment'),
    '{"mode": "manual", "upiId": ""}'::jsonb
  );
$$;

revoke all on function public.get_payment_settings() from public;
grant execute on function public.get_payment_settings() to anon, authenticated;
