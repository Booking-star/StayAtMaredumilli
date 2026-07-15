-- Migration: Add Google Maps link to hotel rooms

-- 1. Add map_link column to rooms table if it does not exist
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS map_link text DEFAULT '';

-- 2. Recreate rooms_public view to include map_link
CREATE OR REPLACE VIEW public.rooms_public AS
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
  coalesce(weekend_policy::text, 'mon_fri') as weekend_policy,
  map_link
FROM public.rooms
WHERE active = true;

-- 3. Recreate rooms_with_owner_policy view to include map_link
CREATE OR REPLACE VIEW public.rooms_with_owner_policy AS
SELECT
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
  coalesce(r.weekend_policy::text, o.weekend_policy::text, 'mon_fri') as weekend_policy,
  r.map_link
FROM public.rooms r
LEFT JOIN public.hotel_owners o ON o.id = r.owner_id;

-- 4. Re-grant select access on rooms_public to all roles
GRANT SELECT ON public.rooms_public TO anon, authenticated;
