alter table public.bookings add column if not exists payment_screenshot_url text;
alter table public.bookings add column if not exists manual_payment_status text not null default 'not_required';

update public.site_settings
set value = coalesce(value, '{}'::jsonb) || '{"mode": "manual"}'::jsonb
where key = 'payment' and coalesce(value ->> 'mode', '') in ('', 'mock');

insert into public.site_settings (key, value)
values ('payment', '{"mode": "manual", "upiId": ""}'::jsonb)
on conflict (key) do nothing;

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
