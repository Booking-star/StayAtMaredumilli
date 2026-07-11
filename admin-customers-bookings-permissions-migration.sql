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

alter table public.bookings add column if not exists booking_confirmation_status text not null default 'not_contacted';
alter table public.bookings add column if not exists last_contact_attempt_at timestamptz;

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
