-- ============================================================
-- Migration 066: landlord-authored distance to city universities.
-- ============================================================
--
-- Adds a landlord-supplied "how many metres is this listing from each
-- university" attribute, surfaced on the listing card so students can scan a
-- results grid without opening anything.
--
-- WHY THIS IS NOT `faculty_distances`
-- -----------------------------------
-- We already have `faculties` + `faculty_distances`: OSRM-computed walk/transit
-- MINUTES per listing × FACULTY, healed nightly by /api/cron/recompute-distances.
-- That dataset stays exactly as it is. This is a different thing on all three
-- axes — university granularity (not faculty), metres (not minutes), and
-- self-reported by the landlord (not computed). Critically, migrations 050 and
-- 055 deliberately revoked all non-service writes on `faculty_distances`;
-- landlord-writable data must never land in there.
--
-- The number is entirely landlord-supplied by design: no prefill, no
-- auto-compute, no cross-check against the map pin. Validation is sanity bounds
-- only. If a landlord types the wrong number that is on the landlord — the UI
-- labels it as landlord-listed rather than platform-measured.
--
-- APPLY ORDERING (per CLAUDE.md): apply to prod BEFORE merging the consuming
-- PR. The listing SELECT strings in /api/listings, /api/listings/[id],
-- /api/landlord/listings and src/lib/listingForRender.js all embed the new
-- join, so those routes 500 in the window between deploy and migration.
--
-- (Number is 066: prod's highest applied migration is
-- 065_revoke_anon_landlord_pii_columns, verified via list_migrations.)
-- ============================================================

-- ---------------------------------------------------------------------------
-- universities — city-scoped dimension driving the landlord's dropdown
-- ---------------------------------------------------------------------------
-- No lat/lng: nothing computes against these rows (that is the whole point of
-- the no-prefill decision), so coordinates would be dead columns. Add them if a
-- future map layer needs them.
create table if not exists public.universities (
  university_id text primary key,
  city_slug     text    not null,
  name          text    not null,
  short_name    text    not null,
  sort_order    integer not null default 0
);

create index if not exists idx_universities_city_slug
  on public.universities (city_slug);

comment on table public.universities is
  'City-scoped university reference points. `city_slug` matches SUPPORTED_CITIES in src/lib/cityRoutes.js. Public read-only; seeded by migration.';

-- ---------------------------------------------------------------------------
-- listing_university_distances — the landlord-authored fact
-- ---------------------------------------------------------------------------
-- 50 km ceiling is a typo guard (a metres/kilometres mix-up, or a stray zero),
-- not a claim about what is plausible. Nothing here judges correctness.
create table if not exists public.listing_university_distances (
  listing_id      text        not null references public.listings(listing_id) on delete cascade,
  university_id   text        not null references public.universities(university_id) on delete cascade,
  distance_meters integer     not null check (distance_meters > 0 and distance_meters <= 50000),
  updated_at      timestamptz not null default now(),
  primary key (listing_id, university_id)
);

create index if not exists idx_lud_university_id
  on public.listing_university_distances (university_id);

comment on table public.listing_university_distances is
  'Landlord-reported straight-line distance in metres from a listing to a university. Self-reported, never computed or verified — see migration 066.';

-- ---------------------------------------------------------------------------
-- Seed: Thessaloniki. AUTH, UoM, IHU — the three universities in the city.
-- ---------------------------------------------------------------------------
insert into public.universities (university_id, city_slug, name, short_name, sort_order) values
  ('auth', 'thessaloniki', 'Aristotle University of Thessaloniki', 'AUTH', 1),
  ('uom',  'thessaloniki', 'University of Macedonia',              'UoM',  2),
  ('ihu',  'thessaloniki', 'International Hellenic University',    'IHU',  3)
on conflict (university_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.universities enable row level security;

-- Public dimension data — the dropdown and the card labels both read it
-- unauthenticated. No write policy: rows only ever change via migration.
create policy "Public can read universities"
  on public.universities for select using (true);

alter table public.listing_university_distances enable row level security;

create policy "Public can read listing university distances"
  on public.listing_university_distances for select using (true);

-- Ownership predicate mirrors the `listing_amenities` policy in migration 005 —
-- join through listings to the caller's landlord row. auth.uid() is wrapped in
-- a scalar subquery so Postgres hoists it into a one-shot InitPlan instead of
-- re-evaluating per row (the auth_rls_initplan convention set by migration 063).
create policy "Landlords can manage distances for their listings"
  on public.listing_university_distances for all
  using (
    listing_id in (
      select l.listing_id from public.listings l
      join public.landlords ld on ld.landlord_id = l.landlord_id
      where ld.auth_user_id = (select auth.uid())
    )
  )
  with check (
    listing_id in (
      select l.listing_id from public.listings l
      join public.landlords ld on ld.landlord_id = l.landlord_id
      where ld.auth_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.universities to anon, authenticated;
grant select on public.listing_university_distances to anon, authenticated;
grant insert, update, delete on public.listing_university_distances to authenticated;

-- No backfill. Existing listings carry no distance rows until their landlord
-- edits them; the card renders nothing rather than a placeholder.
