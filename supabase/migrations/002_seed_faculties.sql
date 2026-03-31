-- ============================================================
-- Migration 002: Faculty reference points
-- Real Thessaloniki university locations, grouped where sensible
-- ============================================================

INSERT INTO faculties (faculty_id, name, university, lat, lng) VALUES
  -- AUTH (Aristotle University of Thessaloniki)
  -- Main campus covers: Engineering, Sciences, Philosophy, Law, Economics, Theology, Education, Fine Arts
  ('auth-main',        'AUTH Main Campus',           'AUTH', 40.6301, 22.9563),
  -- Medical campus near AHEPA hospital: Medicine, Dentistry, Pharmacy, Veterinary
  ('auth-medical',     'AUTH Medical School',         'AUTH', 40.6225, 22.9555),
  -- Agriculture campus, west side of main campus
  ('auth-agriculture', 'AUTH School of Agriculture',  'AUTH', 40.6290, 22.9510),

  -- UoM (University of Macedonia)
  -- Single campus on Egnatia: Economics, Business, Social Sciences, Applied Informatics
  ('uom-main',        'UoM Main Campus',             'UoM',  40.6253, 22.9614),

  -- IHU (International Hellenic University)
  -- Thermi campus (east): main IHU campus
  ('ihu-thermi',      'IHU Thermi Campus',           'IHU',  40.5678, 22.9975),
  -- Sindos campus (west): engineering and industrial programs
  ('ihu-sindos',      'IHU Sindos Campus',           'IHU',  40.6720, 22.8090);
