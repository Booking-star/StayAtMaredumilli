-- Composite performance indexes to speed up range availability searches
CREATE INDEX IF NOT EXISTS bookings_room_range_idx 
ON public.bookings(room_id, check_in, check_out) 
WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS booking_holds_room_range_idx 
ON public.booking_holds(room_id, check_in, check_out) 
WHERE status = 'held';
