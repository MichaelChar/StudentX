-- 059_pending_listings_pipeline
--
-- Consent-gated pre-population pipeline.
--
-- Adds a PRIVATE staging area for housing listings that have been ingested from
-- external sites (Spitogatos, XE.gr, …) or migrated out of the existing fake
-- seed data, BEFORE a landlord has consented to publish them. Nothing in here is
-- ever shown on the public directory: a pending listing only becomes a real
-- public `listings` row when the landlord opens their magic claim link and
-- clicks "Publish", which copies the data into the existing public star schema
-- (landlords → rent/location/property_types → listings).
--
-- Storage layer note (vs. the original Cloudflare-D1/R2-flavoured spec): this
-- repo is Supabase Postgres + Supabase Storage, so the pending tables ship as a
-- normal numbered migration and ingested photos go to a new `pending-photos`
-- Storage bucket rather than D1/R2. The LLM extraction still runs on Cloudflare
-- Workers AI (no external API keys). Concrete adaptations:
--   * TEXT ids are app-minted ('pl_<uuid>' / 'pli_<uuid>'), not D1 rowids.
--   * TIMESTAMPTZ columns instead of INTEGER epochs — matches every other table.
--   * photos_json is JSONB (array of { path, url }) instead of a TEXT blob.
--   * migrated_from_listing_id / published_* columns make the fake-listings
--     migration and the publish step idempotent (safe to re-run / re-click).
--
-- RLS: both tables have RLS ENABLED with NO policies, and all privileges revoked
-- from anon/authenticated. They are reachable ONLY through the service-role
-- client (getSupabaseAsService) from server code that has already authorised the
-- caller — the admin email allowlist for /admin/*, or a valid, unexpired claim
-- token for /claim/*. This guarantees a pending row is never readable by a
-- public/anon Supabase client.
--
-- APPLY ORDERING (per CLAUDE.md): apply to prod during PR review, before the
-- consuming routes deploy. Nothing public SELECTs these tables, so a pre-deploy
-- gap is harmless; the new /admin and /claim routes simply 500 until it lands.

-- ---------------------------------------------------------------------------
-- pending_landlords — pre-account landlord records (no auth.users link yet)
-- ---------------------------------------------------------------------------
create table if not exists public.pending_landlords (
  id                      text primary key,
  display_name            text,
  phone                   text,
  email                   text,
  notes                   text,
  status                  text not null default 'pending'
                            check (status in ('pending', 'claim_sent', 'claimed', 'archived')),
  claim_token             text unique,
  claim_token_expires_at  timestamptz,
  published_landlord_id   text,           -- public landlords.landlord_id minted at publish (audit + idempotency)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  claimed_at              timestamptz
);

-- ---------------------------------------------------------------------------
-- pending_listings — staged listings awaiting landlord consent
-- ---------------------------------------------------------------------------
create table if not exists public.pending_listings (
  id                        text primary key,
  pending_landlord_id       text references public.pending_landlords(id) on delete set null,
  source_url                text,
  source_type               text not null,       -- 'scraped' | '<hostname>' | 'migrated_fake' | 'manual'
  migrated_from_listing_id  text unique,          -- source public listing_id; idempotency key for the fake migration
  address                   text,
  neighborhood              text,
  beds                      integer,
  baths                     integer,
  sqm                       integer,
  price_eur_month           integer,
  property_type             text,                 -- enum-ish: studio|1-bed|2-bed|3-bed|room|other
  description               text,
  photos_json               jsonb not null default '[]'::jsonb,  -- array of { path, url }
  contact_phone_extracted   text,
  contact_email_extracted   text,
  published_listing_id      text,                 -- public listings.listing_id minted at publish (audit + idempotency)
  status                    text not null default 'pending'
                              check (status in ('pending', 'assigned', 'needs_manual_entry', 'published', 'error')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  claimed_at                timestamptz
);

create index if not exists idx_pending_listings_landlord on public.pending_listings(pending_landlord_id);
create index if not exists idx_pending_listings_status   on public.pending_listings(status);
create index if not exists idx_pending_landlords_token   on public.pending_landlords(claim_token);

-- updated_at auto-touch — reuses update_updated_at() defined in migration 001.
drop trigger if exists trigger_pending_landlords_updated_at on public.pending_landlords;
create trigger trigger_pending_landlords_updated_at
  before update on public.pending_landlords
  for each row execute function update_updated_at();

drop trigger if exists trigger_pending_listings_updated_at on public.pending_listings;
create trigger trigger_pending_listings_updated_at
  before update on public.pending_listings
  for each row execute function update_updated_at();

-- ---------------------------------------------------------------------------
-- Lockdown: service-role-only access.
-- RLS enabled + zero policies => anon/authenticated are denied every operation.
-- Privileges revoked as belt-and-braces; service_role bypasses RLS and is
-- granted explicitly so the server-side service client keeps working.
-- ---------------------------------------------------------------------------
alter table public.pending_landlords enable row level security;
alter table public.pending_listings  enable row level security;

revoke all on public.pending_landlords from anon, authenticated;
revoke all on public.pending_listings  from anon, authenticated;

grant all on public.pending_landlords to service_role;
grant all on public.pending_listings  to service_role;

-- ---------------------------------------------------------------------------
-- pending-photos Storage bucket — holds photos downloaded from external
-- listings during ingest, under unguessable keys pending/<pending_listing_id>/.
-- Public-read like listing-photos / landlord-photos so the (server-gated) admin
-- dashboard and (token-gated) claim page can render thumbnails by URL without
-- minting signed URLs. No write policy is created, so only the service role
-- (which bypasses storage RLS) can upload — exactly how the ingest route writes.
-- On publish, ingested photos are copied into the public `listing-photos` bucket.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pending-photos', 'pending-photos', true)
on conflict (id) do nothing;
