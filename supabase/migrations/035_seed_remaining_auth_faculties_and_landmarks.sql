-- ============================================================
-- Migration 035: Backfill missing AUTH faculties + add two
-- dedicated landmark reference points (library, AHEPA hospital).
-- ============================================================
--
-- Why this exists
-- ---------------
-- Source-control drift. Production has 11 AUTH faculty rows but the
-- committed seed (002_seed_faculties.sql) only inserts 3 of them
-- (auth-main, auth-medical, auth-agriculture). A fresh dev clone
-- therefore can't reproduce production — multiple PMs have flagged
-- this. This migration brings the SQL truth in line with the live
-- truth so every new env starts with the full faculty set.
--
-- Production state at write time (11 AUTH rows; no auth-main):
--   auth-agriculture, auth-economics, auth-education, auth-engineering,
--   auth-fine-arts, auth-law, auth-medical, auth-pe, auth-philosophy,
--   auth-sciences, auth-theology
--
-- 002 already covers auth-medical and auth-agriculture. The 9 inserts
-- below cover the remainder. Coordinates are taken from the live row
-- values (fetched via Supabase MCP, treated as source of truth) so
-- re-running 002 + 035 on a fresh stack reproduces production for
-- every faculty id that production has. Note: auth-medical maps to
-- 'Faculty of Health Sciences' in production (the pre-existing fix
-- from the H4 fuzzy-name mismatch); we do NOT rename it here.
--
-- auth-main (in 002 but not in production) is left alone. Production
-- never had a generic main-campus row — the specific faculties cover
-- the same campus area — and removing it from local would diverge a
-- working dev fixture from no real benefit. Out of scope for 035.
--
-- Idempotency
-- -----------
-- Every insert is `ON CONFLICT (faculty_id) DO NOTHING`. On
-- production this migration is therefore a strict no-op for the 9
-- AUTH rows (they already exist) — it only inserts the 2 new
-- landmarks. On a fresh dev clone all 11 rows insert. On a partial
-- environment the migration heals whatever's missing without
-- erroring on rows that exist.
--
-- New landmarks
-- -------------
-- The listing detail page's distance table currently fakes 'Central
-- Library' by proxying to auth-main and 'AHEPA Hospital' by proxying
-- to auth-medical. We add two real reference points so the table can
-- show three honest rows. These ARE new on production and will
-- insert. faculty_distances rows for the new ids are populated
-- post-merge via scripts/compute_distances.py --only-missing
-- (covered in docs/runbooks/035-faculty-backfill.md).
--
-- Coordinates: AHEPA University Hospital is the AUTH-affiliated
-- teaching hospital adjacent to the medical campus; AUTH Central
-- Library sits on the main-campus quadrangle.
-- ============================================================

INSERT INTO faculties (faculty_id, name, university, lat, lng) VALUES
  -- AUTH faculties missing from 002 (9 rows; coords from prod)
  ('auth-economics',   'Faculty of Social & Economic Sciences',     'AUTH', 40.6301, 22.9563),
  ('auth-education',   'Faculty of Education',                      'AUTH', 40.6301, 22.9563),
  ('auth-engineering', 'Faculty of Engineering',                    'AUTH', 40.6310, 22.9590),
  ('auth-fine-arts',   'Faculty of Fine Arts',                      'AUTH', 40.5584, 23.0093),
  ('auth-law',         'Faculty of Law',                            'AUTH', 40.6301, 22.9563),
  ('auth-pe',          'Faculty of Physical Education & Sport Sciences', 'AUTH', 40.5584, 23.0093),
  ('auth-philosophy',  'Faculty of Philosophy',                     'AUTH', 40.6301, 22.9563),
  ('auth-sciences',    'Faculty of Sciences',                       'AUTH', 40.6301, 22.9563),
  ('auth-theology',    'Faculty of Theology',                       'AUTH', 40.6301, 22.9563),

  -- New landmark reference points (2 rows; net-new on production)
  ('auth-library',     'AUTH Central Library',                      'AUTH', 40.6299, 22.9590),
  ('ahepa-hospital',   'AHEPA University Hospital',                 'AUTH', 40.6258, 22.9555)
ON CONFLICT (faculty_id) DO NOTHING;
