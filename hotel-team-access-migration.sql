alter table public.bookings add column if not exists created_by uuid;
alter table public.bookings add column if not exists source text not null default 'website';

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings
  add constraint bookings_source_check check (source in ('website', 'offline', 'agent'));

create table if not exists public.hotel_members (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel_owners(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'pending')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (hotel_id, user_id)
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel_owners(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  created_by uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists hotel_members_user_idx on public.hotel_members(user_id, status);
create index if not exists hotel_members_hotel_idx on public.hotel_members(hotel_id, status);
create index if not exists invite_codes_lookup_idx on public.invite_codes(code, expires_at) where used_at is null;
create index if not exists bookings_created_by_idx on public.bookings(created_by);
create index if not exists bookings_source_idx on public.bookings(source);

alter table public.hotel_members enable row level security;
alter table public.invite_codes enable row level security;

insert into public.hotel_members (hotel_id, user_id, role, status, joined_at)
select id, id, 'owner', 'active', now()
from public.hotel_owners
where active = true
on conflict (hotel_id, user_id) do update
set role = 'owner',
    status = 'active',
    joined_at = coalesce(public.hotel_members.joined_at, excluded.joined_at);

drop policy if exists "hotel_members read own hotels" on public.hotel_members;
create policy "hotel_members read own hotels"
on public.hotel_members for select
to authenticated
using (
  public.is_admin()
  or user_id = (select auth.uid())
  or exists (
    select 1
    from public.hotel_members mine
    where mine.hotel_id = hotel_members.hotel_id
      and mine.user_id = (select auth.uid())
      and mine.role = 'owner'
      and mine.status = 'active'
  )
);

drop policy if exists "hotel_members admin all" on public.hotel_members;
create policy "hotel_members admin all"
on public.hotel_members for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "invite_codes owner read" on public.invite_codes;
create policy "invite_codes owner read"
on public.invite_codes for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.hotel_members mine
    where mine.hotel_id = invite_codes.hotel_id
      and mine.user_id = (select auth.uid())
      and mine.role = 'owner'
      and mine.status = 'active'
  )
);

drop policy if exists "invite_codes admin all" on public.invite_codes;
create policy "invite_codes admin all"
on public.invite_codes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "rooms owner read" on public.rooms;
create policy "rooms owner read"
on public.rooms for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.hotel_members mine
    where mine.hotel_id = rooms.owner_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
  )
);

drop policy if exists "bookings owner read" on public.bookings;
create policy "bookings owner read"
on public.bookings for select
to authenticated
using (
  exists (
    select 1
    from public.rooms r
    join public.hotel_members mine on mine.hotel_id = r.owner_id
    where r.id = bookings.room_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
  )
);

drop policy if exists "bookings owner update" on public.bookings;
create policy "bookings owner update"
on public.bookings for update
to authenticated
using (
  status = 'offline_blocked'
  and exists (
    select 1
    from public.rooms r
    join public.hotel_members mine on mine.hotel_id = r.owner_id
    where r.id = bookings.room_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and (
        mine.role = 'owner'
        or bookings.created_by = (select auth.uid())
      )
  )
)
with check (status = 'cancelled');

drop view if exists public.owner_bookings;
create view public.owner_bookings
with (security_invoker = true) as
select
  b.id,
  b.room_id,
  b.customer_name,
  b.customer_phone,
  b.check_in,
  b.check_out,
  b.num_rooms,
  b.num_adults,
  b.num_kids,
  b.total_price,
  b.owner_amount,
  b.status,
  b.payment_option,
  b.created_by,
  b.source,
  b.created_at
from public.bookings b
join public.rooms r on r.id = b.room_id
where public.is_admin()
   or exists (
    select 1
    from public.hotel_members mine
    where mine.hotel_id = r.owner_id
      and mine.user_id = (select auth.uid())
      and mine.status = 'active'
  );
grant select on public.owner_bookings to authenticated;

grant select on public.hotel_members to authenticated;
grant select on public.invite_codes to authenticated;
grant select on public.rooms to authenticated;
grant select on public.bookings to authenticated;
grant update(status) on public.bookings to authenticated;
