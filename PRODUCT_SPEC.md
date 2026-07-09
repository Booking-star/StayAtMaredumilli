# Stay@Maredumilli Product Specification (v1.2)

This document contains the complete product specification, system architecture, database schema, file layouts, business logic constraints, and a master agent prompt for **Stay@Maredumilli** from end-to-end. Use this document to either continue development or reconstruct the entire platform from scratch.

---

## 1. Rebuilding Agent Prompt (System Prompt)

If you are starting from scratch, pass the following prompt to a new agent:

```text
Build a complete hotel booking and referral application for "Stay@Maredumilli" using Vanilla HTML5, Vanilla JavaScript, Vanilla CSS, and Supabase. The project requires three distinct user portals: Customer Site, Hotel Owner Portal, and Super Admin Portal.

Requirements:
1. Tech Stack: No modern JS frameworks. Use vanilla ES6 Javascript, HTML5, and vanilla CSS variables with a modern dark-mode aesthetic. Use Supabase JS client for database and authentication.
2. User Portals:
   - Customer Portal: Features a full-screen background video landing page, Instagram reels highlights (fetched from DB), dynamic room listing, details page with responsive carousels, date checker, total calculations, and booking placement.
   - Hotel Owner Portal: Allows hotel owners to log in, view total sales, booking calendar grids, list and block room dates, and manage their reservations ledger.
   - Super Admin Portal: Allows creation of hotel owners, viewing hotel owner credentials, managing rooms and owners, reviewing sales/revenue ledgers (revenue, owner payout, platform profit), registering influencers with unique link generation, and managing highlights.
3. Key Rules & Easter Eggs:
   - Super Admin can reveal all owner passwords on the admin portal using the master password bypass "HappyBirthday".
   - Influencers have unique tracking links (?ref=code). Visits and bookings must be tracked and attributed to them.
   - The UI must be mobile-responsive, modern, and beautiful. Use CSS variables for design tokens.
```

---

## 2. Platform Architecture & File Layout

The codebase is structured as a single-page application (SPA) on Vercel:

```text
we-are-going-to-create-a/
├── admin.html               # Super Admin Portal HTML
├── admin.js                 # Super Admin Portal Business Logic
├── app.js                   # Customer Portal Business Logic
├── index.html               # Customer Portal HTML
├── login.html               # Unified Login Portal (Admin & Owners)
├── manifest.json            # PWA Web Manifest
├── owner.html               # Hotel Owner Portal HTML
├── owner.js                 # Hotel Owner Portal Business Logic
├── styles.css               # Central stylesheet containing the dark theme & layout styles
├── supabase-config.js       # App Supabase credentials
├── sw.js                    # PWA Service Worker
└── vercel.json              # Routing configuration
```

---

## 3. Database Schema & Policies (Supabase DDL)

Here is the complete SQL schema to configure Supabase:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Hotel Owners Table
CREATE TABLE IF NOT EXISTS public.hotel_owners (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_name text NOT NULL,
  phone text,
  password_plain text, -- Saved for Super Admin recovery
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.hotel_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotel_owners select" ON public.hotel_owners FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotel_owners write admin" ON public.hotel_owners FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid REFERENCES public.hotel_owners(id) ON DELETE SET NULL,
  room_name text NOT NULL,
  room_type text NOT NULL,
  available_rooms integer NOT NULL DEFAULT 0,
  max_adults integer NOT NULL DEFAULT 1,
  weekday_price integer NOT NULL DEFAULT 0,
  weekend_price integer NOT NULL DEFAULT 0,
  amenities text[] NOT NULL DEFAULT '{}',
  special_attention text DEFAULT '',
  image_urls text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms public read" ON public.rooms FOR SELECT USING (active = true);
CREATE POLICY "rooms admin write" ON public.rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Influencers Table
CREATE TABLE IF NOT EXISTS public.influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  visits integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "influencers select public" ON public.influencers FOR SELECT USING (true);
CREATE POLICY "influencers write admin" ON public.influencers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Bookings Table
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  num_rooms integer NOT NULL DEFAULT 1,
  num_adults integer NOT NULL DEFAULT 1,
  num_kids integer NOT NULL DEFAULT 0,
  total_price integer NOT NULL DEFAULT 0,
  owner_amount integer NOT NULL DEFAULT 0,  -- 85% of total_price
  profit_amount integer NOT NULL DEFAULT 0, -- 15% of total_price
  status text NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'cancelled', 'offline_blocked'
  payment_option text,                      -- 'online', 'offline'
  payment_id text
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings public read" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "bookings public insert" ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "bookings owner modify" ON public.bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Highlights Table (Instagram Reels)
CREATE TABLE IF NOT EXISTS public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  url text NOT NULL,
  image_url text NOT NULL
);

ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "highlights select public" ON public.highlights FOR SELECT USING (true);
CREATE POLICY "highlights write admin" ON public.highlights FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Storage Buckets (room-images)
-- Ensure 'room-images' bucket is created and set to public in storage.buckets.
-- Policies:
-- Allow select for bucket_id = 'room-images' to public.
-- Allow insert/update/delete for bucket_id = 'room-images' to authenticated users.

-- 7. SQL Functions & Procedures
CREATE OR REPLACE FUNCTION public.increment_influencer_visits(ref_code text)
RETURNS void AS $$
BEGIN
  UPDATE public.influencers
  SET visits = visits + 1
  WHERE lower(code) = lower(ref_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. User Roles & Business Logic Rules

### 4.1 Customers
- **Background Video:** The landing page plays `landing.mp4` on desktop and `landing-vertical.mp4` on mobile viewports.
- **Highlights of Maredumilli Trip:** Renders circular Instagram reel story highlights dynamically from the `highlights` database table. Clicking a highlight opens an Instagram post embed in a popup modal.
- **Date Picking:** Date inputs have min-attributes dynamically constrained to `today` to prevent historical selections.
- **Attribution:** Visiting the site with `?ref=code` sets the influencer's unique referral cookie/local storage. If they make a booking, the `influencer_id` is linked, and the influencer's visits are incremented using `increment_influencer_visits`.
- **Payment Options:**
  - **Online:** Marks booking as confirmed and stores the simulated payment gateway ID.
  - **Offline:** Confirms the booking immediately. Guests settle invoice during check-in.

### 4.2 Hotel Owners
- **Financial Split:** Bookings automatically calculate an 85% owner payout (`owner_amount`) and a 15% platform profit share (`profit_amount`).
- **Portal Actions:** Owners can add calendar blocks (dates where room availability is 0), view custom room statistics, and inspect check-ins.

### 4.3 Super Admin
- **Password Reveal Easter Egg:** Clicking the password field in the Hotel Owners management panel reveals the plaintext password of any registered owner ONLY IF the master password **"HappyBirthday"** is entered.
- **Influencer Tracker:** Displays registration forms for new influencers, generates custom referral links (`https://<domain>/?ref=<code>`), and aggregates total influencer visits, attributed bookings, and generated revenue.
- **Highlights Manager:** Supports adding new highlights (name, cover image upload, and Instagram reel url), editing existing details, or removing them.

---

## 5. Responsive Styling System

Central variables defined in `styles.css` create a cohesive dark mode aesthetic:
- **Design Tokens:** `--bg-color` (`#121212`), `--panel-bg` (`#1a1a1a`), `--accent` (`#2e7d32`), `--text` (`#ffffff`), `--muted` (`#a0a0a0`).
- **Responsive Layout Breakpoints:** 
  - Media queries stack columns on mobile screens (`max-width: 640px`).
  - `.topbar` utilizes `justify-content: space-between` and `flex-wrap: wrap` to prevent element overlaps on narrower viewports.
  - `.sales-item` and `.influencer-item` automatically transform from flex-row items to vertical grids on mobile.
