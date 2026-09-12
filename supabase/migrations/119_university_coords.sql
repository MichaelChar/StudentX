-- ============================================================
-- Migration 119: coordinates on `universities`.
-- ============================================================
--
-- WHY
-- ---
-- /api/landlord/compute-university-distances derives each university's
-- position from `faculties` — it collapses faculty rows to their parent
-- university and keeps the nearest campus. That works only for universities
-- that HAVE faculty rows, and prod holds 13 faculties, all of them AUTH.
--
-- So prod could measure exactly one university. After the wizard's
-- universities step became read-only (PR #542), a landlord could no longer
-- type the other two by hand, and the step's "at least 2 distances" gate
-- refused to let them continue — an error with nothing they could do about it.
--
-- Migration 066 created this table without coordinates and said so:
-- "No lat/lng: nothing computes against these rows (that is the whole point
-- of the no-prefill decision), so coordinates would be dead columns. Add them
-- if a future map layer needs them." Prefill arrived, so they are needed now.
--
-- WHY NOT SEED UoM / IHU INTO `faculties` INSTEAD
-- -----------------------------------------------
-- `faculties` is student-facing: it drives the faculty picker, the quiz, and
-- `faculty_distances` (OSRM walk/transit MINUTES per listing × faculty, healed
-- by the recompute-distances cron). Adding two rows there to fix a landlord
-- measurement would put two new options in front of students and add rows to a
-- table the cron recomputes. UoM and IHU each teach from one central campus,
-- so a single point per university is the whole of the data anyway.
--
-- Faculties stay the PREFERRED source where they exist — nearest-campus is
-- better than a centroid for AUTH's 13 sites, including Fine Arts out at
-- Thermi. These columns are the fallback for universities with no faculty rows.
--
-- COORDINATES
-- -----------
-- OpenStreetMap, cross-checked against the Overpass campus polygons
-- (2026-09-11):
--   auth 40.6296719, 22.9591469  main campus, Agiou Dimitriou
--   uom  40.6252099, 22.9599727  Egnatia 156 (campus way centroid)
--   ihu  40.6575637, 22.8108475  Alexandria campus, Sindos
--
-- Nullable on purpose: a city added later without coordinates should fail
-- soft (that university simply reports no distance) rather than block the
-- insert. No CHECK on range either — the values are ours, not user input.
--
-- APPLY ORDERING (per CLAUDE.md): applied to prod BEFORE the consuming PR
-- merges. The route SELECTs these columns, so it would 500 in the gap.
-- ============================================================

alter table public.universities
  add column if not exists lat double precision,
  add column if not exists lng double precision;

comment on column public.universities.lat is
  'Campus latitude. Fallback position for distance measurement when the university has no `faculties` rows; faculties win where they exist. Source: OpenStreetMap.';
comment on column public.universities.lng is
  'Campus longitude. See universities.lat.';

update public.universities set lat = 40.6296719, lng = 22.9591469 where university_id = 'auth';
update public.universities set lat = 40.6252099, lng = 22.9599727 where university_id = 'uom';
update public.universities set lat = 40.6575637, lng = 22.8108475 where university_id = 'ihu';
