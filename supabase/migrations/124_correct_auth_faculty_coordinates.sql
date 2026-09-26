-- ============================================================
-- Migration 124: Correct AUTH faculty coordinates
-- ============================================================
--
-- Why this exists
-- ---------------
-- Every AUTH faculty point was either a placeholder or wrong, and
-- faculty_distances (walk/bus minutes on every listing) plus the computed
-- AUTH entry in listing_university_distances are measured to these points.
--
--   * Six faculties (economics, education, law, philosophy, sciences,
--     theology) shared ONE point, 40.6301,22.9563: 002's generic
--     'auth-main' placeholder, which 035 then copied from prod as if it
--     were a real location.
--   * auth-medical ('Faculty of Health Sciences') sat ~1 km south of the
--     Medical School; ahepa-hospital ~600 m from the hospital;
--     auth-agriculture ~720 m west of its building, off campus.
--   * auth-fine-arts and auth-pe shared one Thermi point ~1 km from either
--     building.
--
-- Source
-- ------
-- OpenStreetMap building centroids (Overpass, 2026-09-25). Each point was
-- checked to snap to the FOSSGIS foot network within 40 m. Shift from the
-- old value in brackets.
--
--   ahepa-hospital    relation 13106683  University Hospital AHEPA     [599 m]
--   auth-agriculture  relation 13109818  Σχολή Γεωπονίας και Δασολογίας [719 m]
--   auth-economics    way 23188520       Σχολή Νομικών, Οικονομικών και
--                                        Πολιτικών Επιστημών          [120 m]
--   auth-education    way 27661178       Πύργος Παιδαγωγικής Σχολής    [524 m]
--   auth-engineering  way 161691112      Διοίκηση Πολυτεχνικής Σχολής  [288 m]
--   auth-fine-arts    way 1372523848     Σχολή Καλών Τεχνών, Thermi    [994 m]
--   auth-law          way 23188520       (same building as economics)  [120 m]
--   auth-library      relation 13106236  Κεντρική Βιβλιοθήκη ΑΠΘ       [ 94 m]
--   auth-medical      relation 13107179  Ιατρική Σχολή                 [1054 m]
--   auth-pe           way 1372523847     ΤΕΦΑΑ, Thermi                 [1248 m]
--   auth-philosophy   way 23770908       Νέα Φιλοσοφική Σχολή          [178 m]
--   auth-sciences     way 23188465       Σχολή Θετικών Επιστημών       [401 m]
--   auth-theology     way 23770890       Θεολογική Σχολή               [121 m]
--
-- Known limit: one point per faculty. Fine Arts is multi-site. Visual Arts'
-- studios and Music are at the Thermi campus (the point used), but Theatre
-- is on Egnatia (city centre) and Film is in Stavroupoli. A student of
-- those two departments gets a Thermi distance.
--
-- Distances are NOT recomputed here. recomputeMissingDistances only fills
-- gaps, so the existing faculty_distances rows (and the computed AUTH rows
-- in listing_university_distances) are rewritten by a one-off backfill
-- after this applies. See the PR.
--
-- Idempotent: plain UPDATEs keyed on faculty_id. On a fresh stack, 002 and
-- 035 insert the old values and this corrects them.
-- ============================================================

UPDATE faculties AS f
SET lat = v.lat, lng = v.lng
FROM (VALUES
  ('ahepa-hospital',   40.62920, 22.96100),
  ('auth-agriculture', 40.63288, 22.95781),
  ('auth-economics',   40.63112, 22.95678),
  ('auth-education',   40.62747, 22.96145),
  ('auth-engineering', 40.62844, 22.95852),
  ('auth-fine-arts',   40.56497, 23.00132),
  ('auth-law',         40.63112, 22.95678),
  ('auth-library',     40.62961, 22.95795),
  ('auth-medical',     40.63117, 22.96056),
  ('auth-pe',          40.56787, 23.00136),
  ('auth-philosophy',  40.63156, 22.95543),
  ('auth-sciences',    40.63369, 22.95672),
  ('auth-theology',    40.63079, 22.95519)
) AS v(faculty_id, lat, lng)
WHERE f.faculty_id = v.faculty_id;
