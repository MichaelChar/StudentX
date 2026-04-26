-- ============================================================
-- Migration 024: Unstack Ano Poli map markers
-- ============================================================
-- The first six seed listings (0100001–0100006) all share
-- lat/lng (40.6425, 22.952). On the Leaflet map their markers
-- stack into a single pin, so a student opening the map view
-- sees one Ano Poli result instead of six.
--
-- The CHECK constraint on `location` (set in migration 014)
-- only allows lat ∈ [40.55, 40.70] and lng ∈ [22.80, 23.05] —
-- comfortably within Thessaloniki, so even ~50m offsets stay
-- valid. Approximate distances at this latitude:
--   ~0.0001° latitude  ≈ 11m N/S
--   ~0.0001° longitude ≈ 8.5m E/W (at 40°N)
--
-- The default Leaflet zoom on the results map is z=13 (~12m/px)
-- and ListingsMap markers are ~25px wide, so anything tighter
-- than ~30m visually still stacks. The offsets below sit at
-- ~30–55m radius around the original centroid so each pin is
-- distinct from city zoom up.
--
-- This is synthetic placeholder data to fix the visual stacking
-- only; replace with real surveyed coords when the listings are
-- onboarded for production. Reversible via the down migration
-- below (commented; uncomment to undo).

UPDATE location SET lat = 40.6432, lng = 22.9535 WHERE listing_id = '0100001';
UPDATE location SET lat = 40.6418, lng = 22.9532 WHERE listing_id = '0100002';
UPDATE location SET lat = 40.6431, lng = 22.9508 WHERE listing_id = '0100003';
UPDATE location SET lat = 40.6415, lng = 22.9510 WHERE listing_id = '0100004';
UPDATE location SET lat = 40.6438, lng = 22.9522 WHERE listing_id = '0100005';
UPDATE location SET lat = 40.6412, lng = 22.9525 WHERE listing_id = '0100006';

-- ---- Reversal (un-comment to revert) --------------------------------
-- UPDATE location SET lat = 40.6425, lng = 22.952
--   WHERE listing_id IN ('0100001','0100002','0100003','0100004','0100005','0100006');
