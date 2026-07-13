-- Recheck room capacity at payment confirmation time. This prevents a late
-- confirmation of an expired hold from overbooking a room.

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
  v_room public.rooms%rowtype;
  v_booking_id uuid;
  v_day date;
  v_booked integer;
  v_held integer;
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

  select * into v_room
  from public.rooms
  where id = v_hold.room_id and active = true
  for update;

  if not found then raise exception 'Room is not available.'; end if;

  for v_day in select generate_series(v_hold.check_in, v_hold.check_out - 1, interval '1 day')::date loop
    select coalesce(sum(num_rooms), 0)::integer into v_booked
    from public.bookings
    where room_id = v_hold.room_id
      and status <> 'cancelled'
      and check_in <= v_day
      and check_out > v_day;

    select coalesce(sum(num_rooms), 0)::integer into v_held
    from public.booking_holds
    where id <> v_hold.id
      and room_id = v_hold.room_id
      and status = 'held'
      and expires_at > now()
      and check_in <= v_day
      and check_out > v_day;

    if v_booked + v_held + v_hold.num_rooms > v_room.available_rooms then
      raise exception 'Room is no longer available for the selected dates.';
    end if;
  end loop;

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

revoke all on function public.confirm_booking_hold_safe(uuid, text) from public;
grant execute on function public.confirm_booking_hold_safe(uuid, text) to service_role;
