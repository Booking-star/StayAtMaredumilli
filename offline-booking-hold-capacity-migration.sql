-- Keep admin/owner offline blocks in sync with active Razorpay room holds.

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
  v_held integer;
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
  if p_num_adults < 1 or p_num_kids < 0 then
    raise exception 'Enter a valid guest count.';
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

    select coalesce(sum(num_rooms), 0)::integer
    into v_held
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
