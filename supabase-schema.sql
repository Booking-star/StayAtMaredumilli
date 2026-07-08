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

-- Enable RLS on bookings
alter table public.bookings enable row level security;

-- Policies for bookings
drop policy if exists "bookings public read" on public.bookings;
create policy "bookings public read" on public.bookings for select using (true);

drop policy if exists "bookings public insert" on public.bookings;
create policy "bookings public insert" on public.bookings for insert with check (true);

drop policy if exists "bookings owner modify" on public.bookings;
create policy "bookings owner modify" on public.bookings for all to authenticated using (true) with check (true);

