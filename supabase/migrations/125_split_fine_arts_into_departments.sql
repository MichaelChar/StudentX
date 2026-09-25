-- ============================================================
-- Migration 125: Split AUTH Fine Arts into its four departments
-- ============================================================
--
-- Why this exists
-- ---------------
-- The School of Fine Arts is not one place. Its four departments sit on
-- three sites up to ~12 km apart, so the single 'auth-fine-arts' point
-- (Thermi, set by 124) gave Drama and Film students a walk time to the
-- wrong side of the city.
--
-- Source: each department's own contact details (checked 2026-09-25), matched
-- to the OpenStreetMap building at that address.
--
--   auth-fine-arts-drama   Egnatia 122, 54622 (thea.auth.gr)
--                          OSM way 651768524, which carries the same address
--                          and the department's email
--   auth-fine-arts-film    Ikoniou 1, Stavroupoli 56430 (film.auth.gr)
--                          OSM way 260933775, addr Ικονίου 1 / 564 30
--   auth-fine-arts-music   Thermi campus, 4th km Charilaou–Thermi (mus.auth.gr)
--                          OSM way 22662280, website mus.auth.gr
--   auth-fine-arts-visual  Thermi campus, 5th km Charilaou–Thermi, opposite
--                          Lida-Maria (vis.auth.gr/ktiria), where the studios
--                          and theory rooms are. OSM way 1372523850. Its
--                          secondary Ikoniou 1 building (exams, metal workshop)
--                          is not modelled. OSM also tags a Visual Arts
--                          building in Pylaia, 1.45 km away and nowhere near
--                          Lida-Maria; that tag is not used.
--
-- Nothing referenced 'auth-fine-arts' when this was written: no inquiries,
-- no students.receiving_faculty. Deleting it cascades its faculty_distances
-- rows (ON DELETE CASCADE) and would null inquiries.faculty_id (ON DELETE
-- SET NULL). The new rows' faculty_distances are filled by the
-- recompute-distances cron, or by the backfill run alongside this migration.
--
-- Idempotent: ON CONFLICT DO NOTHING plus a DELETE that is a no-op on re-run.
-- ============================================================

INSERT INTO faculties (faculty_id, name, university, lat, lng) VALUES
  ('auth-fine-arts-drama',  'Fine Arts – Drama',                'AUTH', 40.63328, 22.94875),
  ('auth-fine-arts-film',   'Fine Arts – Film',                 'AUTH', 40.65808, 22.92783),
  ('auth-fine-arts-music',  'Fine Arts – Music Studies',        'AUTH', 40.56464, 23.00130),
  ('auth-fine-arts-visual', 'Fine Arts – Visual & Applied Arts', 'AUTH', 40.56549, 23.00104)
ON CONFLICT (faculty_id) DO NOTHING;

DELETE FROM faculties WHERE faculty_id = 'auth-fine-arts';
