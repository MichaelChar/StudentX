-- Migration 061: Holiday Gigs vertical
--
-- A new student-facing vertical at /gigs: short-term holiday jobs (paid +
-- unpaid) browsable across countries. Modeled loosely on the listings star
-- schema but kept self-contained — gigs carry their own location columns
-- (country + city + lat/lng) instead of a separate `location` dimension,
-- because they're filtered by country, not commute distance.
--
-- Posting model (issue: Holiday Gigs vertical): admin-seeded now, with an
-- `employer_id` column reserved for a future employer self-serve portal. Until
-- that ships, `employer_id` stays NULL and writes happen via the service role
-- (RLS below blocks anon/authenticated writes).

-- ---------------------------------------------------------------------------
-- 1. gigs (fact table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gigs (
  gig_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  employer_name      TEXT,
  description        TEXT,
  -- Paid vs unpaid is the headline split the student chooses on /gigs.
  is_paid            BOOLEAN NOT NULL DEFAULT true,
  -- Headline pay figure used for the price histogram + card. NULL is allowed
  -- (unpaid gigs, or "pay on application" paid gigs). pay_period is display-only.
  pay_amount         NUMERIC,
  pay_period         TEXT NOT NULL DEFAULT 'month',  -- 'hour' | 'week' | 'month' | 'total'
  currency           TEXT NOT NULL DEFAULT 'EUR',
  -- Location: country drives the filter buttons + map; city/lat/lng power pins.
  country_code       TEXT NOT NULL,                  -- ISO-2, matches GIG_COUNTRIES in src/lib/gigCountries.js
  city               TEXT,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  -- Carried-over filters from the property results page (issue Q3):
  --   availability  -> available_from (gig start date)
  --   stay length   -> min_duration_weeks (holiday gigs are short → weeks)
  available_from     DATE,
  min_duration_weeks INTEGER,
  photos             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Owner-only contact channel — NEVER exposed by the public API/transform
  -- (mirrors listings.contact_info; see src/lib/transformGig.js).
  contact_info       TEXT,
  -- Reserved for the future employer portal. NULL for admin-seeded gigs.
  employer_id        UUID,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gigs_pay_period_check
    CHECK (pay_period IN ('hour', 'week', 'month', 'total')),
  -- Unpaid gigs must not carry a pay figure (keeps the histogram honest).
  CONSTRAINT gigs_unpaid_no_pay
    CHECK (is_paid OR pay_amount IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_gigs_country_code     ON gigs(country_code);
CREATE INDEX IF NOT EXISTS idx_gigs_is_active        ON gigs(is_active);
CREATE INDEX IF NOT EXISTS idx_gigs_is_paid          ON gigs(is_paid);
CREATE INDEX IF NOT EXISTS idx_gigs_available_from   ON gigs(available_from);
CREATE INDEX IF NOT EXISTS idx_gigs_created_at       ON gigs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. gig_inquiries (student → gig "express interest")
-- ---------------------------------------------------------------------------
-- A parallel, lightweight cousin of `inquiries`. The property inquiry stack is
-- tightly coupled to listing_id + landlord routing + the realtime chat thread;
-- with no employer accounts yet there is no recipient to thread a chat with, so
-- gig interest is captured here and emailed to the gigs alert inbox. When the
-- employer portal lands this can grow employer-side reads (or merge into the
-- chat system).
CREATE TABLE IF NOT EXISTS gig_inquiries (
  inquiry_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id         UUID NOT NULL REFERENCES gigs(gig_id) ON DELETE CASCADE,
  -- The submitting student, when signed in (identity pulled from their JWT in
  -- the API route). Nullable so the column survives a future anon-allowed path.
  student_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  student_name   TEXT,
  student_email  TEXT NOT NULL,
  message        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'new',
  email_sent     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gig_inquiries_gig_id     ON gig_inquiries(gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_inquiries_created_at ON gig_inquiries(created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE gigs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_inquiries ENABLE ROW LEVEL SECURITY;

-- gigs: anyone may read ACTIVE gigs. Writes are service-role only (no policy →
-- denied for anon/authenticated; service role bypasses RLS).
DROP POLICY IF EXISTS "Public can read active gigs" ON gigs;
CREATE POLICY "Public can read active gigs"
  ON gigs FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- gig_inquiries: signed-in students may insert their own interest. No SELECT
-- policy → reads are service-role only (admin surface / email job).
DROP POLICY IF EXISTS "Authenticated users can submit gig inquiries" ON gig_inquiries;
CREATE POLICY "Authenticated users can submit gig inquiries"
  ON gig_inquiries FOR INSERT
  TO authenticated
  WITH CHECK (student_user_id = auth.uid());

-- Explicit grants (the project locks down default table privileges — see
-- migrations 033/056). Read gigs from the anon client; write inquiries only
-- when authenticated.
GRANT SELECT ON gigs TO anon, authenticated;
GRANT INSERT ON gig_inquiries TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seed: real listing sourced from Caritas Bergeinsatz (project F12023),
--    translated to English. Photos are hotlinked from the org's public asset
--    CDN (allow-listed in next.config.mjs img-src + images.remotePatterns).
--    Idempotent — keyed on a stable UUID.
-- ---------------------------------------------------------------------------
INSERT INTO gigs (gig_id, title, employer_name, description, is_paid, pay_amount, pay_period, currency, country_code, city, lat, lng, available_from, min_duration_weeks, photos, contact_info)
VALUES
  (
    '00000000-0000-4000-a000-000000000007',
    'Mountain Farm Volunteer',
    'Caritas Mountain Aid (Bergeinsatz)',
    E'A family-run mountain farm at the foot of the Jura in canton Vaud (780 m) needs volunteer help. The farm raises cattle and turkeys and produces forage in mountain zone I, and the family also keeps poultry, sheep, horses, dogs and cats, living largely self-sufficiently. The parents and their adult son share the work — the son looks after the cattle and the machinery, while the mother handles the administration, the horses, the vegetable garden and the non-mechanised jobs. After the son was recently injured, the family urgently needs an extra pair of hands.\n\nYou would help with a real mix of mountain-farm life: garden and household chores, stable and farm work, forestry and woodcutting, pasture maintenance and clearing, and looking after fences and paddocks. Good physical fitness is important, and some French is a plus.\n\nYou will have your own bedroom with a private bathroom and share meals with the family. This is unpaid volunteer work — board and lodging are provided.',
    false, NULL, 'month', 'CHF', 'CH', 'Canton Vaud (Jura foothills)', 46.6500, 6.5000, NULL, 4,
    '["https://assets.bergeinsatz.ch/sites/default/files/styles/gatsby_header_landscape_xl/public/2026-04/f12023_photo009_2026.jpg?h=a0af407e&itok=QzIKnYTE","https://assets.bergeinsatz.ch/sites/default/files/styles/gatsby_carousel_xl/public/2026-04/f12023_photo001_2026_0.jpg?h=d08a7c6c&itok=kkkpjK_U","https://assets.bergeinsatz.ch/sites/default/files/styles/gatsby_carousel_xl/public/2026-04/f12023_photo002_2026_0.jpg?h=0ba8175b&itok=LNWHSJnV","https://assets.bergeinsatz.ch/sites/default/files/styles/gatsby_carousel_xl/public/2026-04/f12023_photo003_2026_0.jpg?h=cb88ca33&itok=FbBSfQCv","https://assets.bergeinsatz.ch/sites/default/files/styles/gatsby_carousel_xl/public/2026-04/f12023_photo004_2026_0.jpg?h=e5eaf244&itok=KhQuWKet"]'::jsonb,
    'https://www.bergeinsatz.ch/fr/f12023/'
  )
ON CONFLICT (gig_id) DO NOTHING;
