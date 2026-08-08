-- S18: location.lat / location.lng become NOT NULL, city-locked CHECKs replaced.
--
-- Why:
--   1. Nullable coords make a listing invisible to map / bounds / distance queries
--      with no indication it existed (docs/airbnb-ui-parity-spec.md).
--   2. The prior CHECKs hardcoded Thessaloniki (lat 40.55–40.70, lng 22.80–23.05)
--      and block multi-city (Athens, Larissa, Heraklion, Nicosia, London, Dublin
--      are already listed as coming-soon in src/lib/cityRoutes.js).
--
-- Prod state at authoring time: 13 location rows, all with both lat and lng set.
-- No backfill required.
--
-- ORDERING — apply this migration to prod ONLY AFTER the consuming PR has
-- merged and Cloudflare has deployed. The code must already refuse null
-- coordinates on every write path; if the constraint lands first, listing
-- creation fails for any remaining null-capable client. The applied-to-prod
-- gate will go red on the PR by design (advisory, see CLAUDE.md).
--
-- Constraint names confirmed from migration 014 (location_lat_check /
-- location_lng_check). Inline CHECKs from migration 001 were recreated as
-- named constraints in 014.

ALTER TABLE location DROP CONSTRAINT IF EXISTS location_lat_check;
ALTER TABLE location DROP CONSTRAINT IF EXISTS location_lng_check;

ALTER TABLE location ALTER COLUMN lat SET NOT NULL;
ALTER TABLE location ALTER COLUMN lng SET NOT NULL;

ALTER TABLE location ADD CONSTRAINT location_coords_sane CHECK (
  lat BETWEEN -90 AND 90
  AND lng BETWEEN -180 AND 180
  AND NOT (lat = 0 AND lng = 0)   -- Null Island: classic geocode failure
);
