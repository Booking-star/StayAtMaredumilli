-- Allows an already-captured Razorpay payment to finish booking even if the
-- browser returned after the hold window. The payment itself is still verified
-- in the server API before this function is called.

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

revoke all on function public.confirm_booking_hold_safe(uuid, text) from public;
grant execute on function public.confirm_booking_hold_safe(uuid, text) to service_role;
