-- ============================================================
-- Seed Data: 10 realistic Thessaloniki student listings
-- Run AFTER migrations 001, 002, and 003
-- Uses 7-digit listing_id format: LLLLNNN (4-digit landlord + 3-digit seq)
-- ============================================================

-- ----------------------------------------
-- Landlords (5)
-- ----------------------------------------
INSERT INTO landlords (landlord_id, name, contact_info) VALUES
  ('0001', 'Kostas Papadopoulos',  '+30 2310 123456'),
  ('0002', 'Maria Georgiou',       'maria.georgiou@email.gr'),
  ('0003', 'Nikos Dimitriou',      '+30 2310 654321'),
  ('0004', 'Elena Katsarou',       'elena.katsarou@email.gr'),
  ('0005', 'Alexandros Tsimikas',  '+30 2310 789012');

-- ----------------------------------------
-- Property types (4)
-- ----------------------------------------
-- Note: migration 003 inserts '2-Bedroom (x2)' with an auto-assigned id, so when
-- supabase start applies migrations BEFORE seed (the CLI default), id=1 may
-- already be taken. ON CONFLICT keeps the seed idempotent in that flow. In a
-- fresh prod where seed runs before migration 003, all four rows insert cleanly.
INSERT INTO property_types (property_type_id, name) VALUES
  (1, 'Studio'),
  (2, '1-Bedroom'),
  (3, '2-Bedroom'),
  (4, 'Room in shared apartment')
ON CONFLICT (property_type_id) DO NOTHING;

-- ----------------------------------------
-- Amenities (10)
-- ----------------------------------------
-- Same idempotency pattern as property_types above — migration 003 inserts
-- amenities with auto-assigned ids when run before seed.
INSERT INTO amenities (amenity_id, name) VALUES
  (1,  'AC'),
  (2,  'Furnished'),
  (3,  'Balcony'),
  (4,  'Elevator'),
  (5,  'Parking'),
  (6,  'Ground floor'),
  (7,  'Washing machine'),
  (8,  'Dishwasher'),
  (9,  'Internet included'),
  (10, 'Heating')
ON CONFLICT (amenity_id) DO NOTHING;

-- ----------------------------------------
-- Rent records (10, one per listing)
-- ----------------------------------------
INSERT INTO rent (rent_id, monthly_price, currency, bills_included, deposit) VALUES
  (1,  500, 'EUR', false, 500),   -- 0001001 Studio, Kentro
  (2,  550, 'EUR', false, 550),   -- 0001002 1-Bed, Kamara
  (3,  700, 'EUR', false, 700),   -- 0002001 2-Bed, Kalamaria
  (4,  580, 'EUR', true,  580),   -- 0002002 1-Bed, Kalamaria (bills incl)
  (5,  500, 'EUR', true,  500),   -- 0003001 Room, Ano Poli (bills incl)
  (6,  520, 'EUR', false, 520),   -- 0003002 Studio, Rotonda
  (7,  750, 'EUR', false, 750),   -- 0004001 2-Bed, Triandria
  (8,  560, 'EUR', false, 560),   -- 0004002 Studio, Kentro
  (9,  530, 'EUR', false, 530),   -- 0005001 1-Bed, Toumba
  (10, 500, 'EUR', true,  500);   -- 0005002 Room, Stavroupoli (bills incl)

-- ----------------------------------------
-- Location records (10, one per listing)
-- ----------------------------------------
INSERT INTO location (location_id, address, neighborhood, lat, lng) VALUES
  (1,  'Tsimiski 45',              'Kentro',       40.6325, 22.9430),
  (2,  'Egnatia 132',              'Kamara',       40.6355, 22.9470),
  (3,  'Vasilissis Olgas 78',      'Kalamaria',    40.6050, 22.9560),
  (4,  'Plastira 15',              'Kalamaria',    40.5980, 22.9510),
  (5,  'Olympou 22',               'Ano Poli',     40.6420, 22.9490),
  (6,  'Kassandrou 88',            'Rotonda',      40.6340, 22.9510),
  (7,  'Venizelou 56',             'Triandria',    40.6390, 22.9610),
  (8,  'Ethnikis Amynis 33',       'Kentro',       40.6290, 22.9480),
  (9,  'Papanastasiou 110',        'Toumba',       40.6180, 22.9650),
  (10, 'Georgiou Papandreou 64',   'Stavroupoli',  40.6530, 22.9350);

-- ----------------------------------------
-- Listings (fact table, 10 rows — 7-digit IDs)
-- ----------------------------------------
INSERT INTO listings (listing_id, landlord_id, rent_id, location_id, property_type_id, description) VALUES
  ('0001001', '0001', 1, 1, 1,
    'Cozy studio in the heart of Kentro, steps from Tsimiski shopping street. Recently renovated with modern finishes.'),
  ('0001002', '0001', 2, 2, 2,
    'Bright 1-bedroom near Kamara and the Arch of Galerius. Great nightlife access and close to university campus.'),
  ('0002001', '0002', 3, 3, 3,
    'Spacious 2-bedroom apartment in Kalamaria with sea views from the balcony. Ideal for two students sharing.'),
  ('0002002', '0002', 4, 4, 2,
    'Comfortable 1-bedroom in quiet Kalamaria neighborhood. Bills included — no surprises. Near the waterfront promenade.'),
  ('0003001', '0003', 5, 5, 4,
    'Affordable room in a shared apartment in Ano Poli with panoramic city views. Authentic Thessaloniki neighborhood.'),
  ('0003002', '0003', 6, 6, 1,
    'Charming studio near the Rotonda monument. Walking distance to AUTH campus and the city center.'),
  ('0004001', '0004', 7, 7, 3,
    'Modern 2-bedroom in Triandria with full amenities. Perfect for students who want comfort close to UoM.'),
  ('0004002', '0004', 8, 8, 1,
    'Well-maintained studio on Ethnikis Amynis, between the city center and the university. Quiet street, good transport links.'),
  ('0005001', '0005', 9, 9, 2,
    'Ground-floor 1-bedroom in Toumba. Easy access, no stairs. Close to local markets and bus routes to campus.'),
  ('0005002', '0005', 10, 10, 4,
    'Budget-friendly room in Stavroupoli with internet and heating included. Good bus connections to all campuses.');

-- ----------------------------------------
-- Listing amenities (join table)
-- ----------------------------------------
INSERT INTO listing_amenities (listing_id, amenity_id) VALUES
  -- 0001001: AC, Furnished, Elevator, Heating
  ('0001001', 1), ('0001001', 2), ('0001001', 4), ('0001001', 10),
  -- 0001002: AC, Furnished, Balcony, Heating
  ('0001002', 1), ('0001002', 2), ('0001002', 3), ('0001002', 10),
  -- 0002001: AC, Furnished, Balcony, Elevator, Parking, Washing machine
  ('0002001', 1), ('0002001', 2), ('0002001', 3), ('0002001', 4), ('0002001', 5), ('0002001', 7),
  -- 0002002: AC, Furnished, Balcony, Washing machine, Internet included
  ('0002002', 1), ('0002002', 2), ('0002002', 3), ('0002002', 7), ('0002002', 9),
  -- 0003001: Furnished, Heating
  ('0003001', 2), ('0003001', 10),
  -- 0003002: AC, Furnished, Balcony, Heating
  ('0003002', 1), ('0003002', 2), ('0003002', 3), ('0003002', 10),
  -- 0004001: AC, Furnished, Balcony, Elevator, Parking, Washing machine, Dishwasher
  ('0004001', 1), ('0004001', 2), ('0004001', 3), ('0004001', 4), ('0004001', 5), ('0004001', 7), ('0004001', 8),
  -- 0004002: AC, Furnished, Elevator, Washing machine, Heating
  ('0004002', 1), ('0004002', 2), ('0004002', 4), ('0004002', 7), ('0004002', 10),
  -- 0005001: AC, Furnished, Ground floor, Washing machine
  ('0005001', 1), ('0005001', 2), ('0005001', 6), ('0005001', 7),
  -- 0005002: Furnished, Internet included, Heating
  ('0005002', 2), ('0005002', 9), ('0005002', 10);

-- ----------------------------------------
-- Faculty distances (10 listings × 6 faculties = 60 rows)
-- Estimated from geographic distance: walk ~5km/h, transit ~15km/h
-- These will be replaced by real OSRM data via compute_distances.py
-- ----------------------------------------
INSERT INTO faculty_distances (listing_id, faculty_id, walk_minutes, transit_minutes) VALUES
  -- 0001001 (Tsimiski 45, Kentro)
  ('0001001', 'auth-main', 18, 8), ('0001001', 'auth-medical', 15, 7),
  ('0001001', 'auth-agriculture', 16, 7), ('0001001', 'uom-main', 20, 9),
  ('0001001', 'ihu-thermi', 55, 25), ('0001001', 'ihu-sindos', 65, 30),
  -- 0001002 (Egnatia 132, Kamara)
  ('0001002', 'auth-main', 14, 6), ('0001002', 'auth-medical', 18, 8),
  ('0001002', 'auth-agriculture', 15, 7), ('0001002', 'uom-main', 17, 7),
  ('0001002', 'ihu-thermi', 58, 26), ('0001002', 'ihu-sindos', 62, 28),
  -- 0002001 (Vasilissis Olgas 78, Kalamaria)
  ('0002001', 'auth-main', 32, 14), ('0002001', 'auth-medical', 22, 10),
  ('0002001', 'auth-agriculture', 30, 13), ('0002001', 'uom-main', 28, 12),
  ('0002001', 'ihu-thermi', 40, 18), ('0002001', 'ihu-sindos', 75, 35),
  -- 0002002 (Plastira 15, Kalamaria)
  ('0002002', 'auth-main', 40, 18), ('0002002', 'auth-medical', 30, 14),
  ('0002002', 'auth-agriculture', 38, 17), ('0002002', 'uom-main', 35, 16),
  ('0002002', 'ihu-thermi', 38, 17), ('0002002', 'ihu-sindos', 80, 38),
  -- 0003001 (Olympou 22, Ano Poli)
  ('0003001', 'auth-main', 16, 8), ('0003001', 'auth-medical', 25, 12),
  ('0003001', 'auth-agriculture', 18, 9), ('0003001', 'uom-main', 22, 10),
  ('0003001', 'ihu-thermi', 60, 28), ('0003001', 'ihu-sindos', 58, 26),
  -- 0003002 (Kassandrou 88, Rotonda)
  ('0003002', 'auth-main', 12, 5), ('0003002', 'auth-medical', 16, 7),
  ('0003002', 'auth-agriculture', 13, 6), ('0003002', 'uom-main', 15, 7),
  ('0003002', 'ihu-thermi', 55, 25), ('0003002', 'ihu-sindos', 65, 30),
  -- 0004001 (Venizelou 56, Triandria)
  ('0004001', 'auth-main', 14, 6), ('0004001', 'auth-medical', 22, 10),
  ('0004001', 'auth-agriculture', 17, 8), ('0004001', 'uom-main', 12, 5),
  ('0004001', 'ihu-thermi', 52, 24), ('0004001', 'ihu-sindos', 60, 28),
  -- 0004002 (Ethnikis Amynis 33, Kentro)
  ('0004002', 'auth-main', 14, 6), ('0004002', 'auth-medical', 10, 5),
  ('0004002', 'auth-agriculture', 12, 6), ('0004002', 'uom-main', 16, 7),
  ('0004002', 'ihu-thermi', 50, 23), ('0004002', 'ihu-sindos', 68, 32),
  -- 0005001 (Papanastasiou 110, Toumba)
  ('0005001', 'auth-main', 20, 9), ('0005001', 'auth-medical', 14, 6),
  ('0005001', 'auth-agriculture', 22, 10), ('0005001', 'uom-main', 15, 7),
  ('0005001', 'ihu-thermi', 42, 19), ('0005001', 'ihu-sindos', 72, 34),
  -- 0005002 (Georgiou Papandreou 64, Stavroupoli)
  ('0005002', 'auth-main', 28, 13), ('0005002', 'auth-medical', 38, 17),
  ('0005002', 'auth-agriculture', 26, 12), ('0005002', 'uom-main', 35, 16),
  ('0005002', 'ihu-thermi', 68, 32), ('0005002', 'ihu-sindos', 45, 20);

-- Reset sequences to avoid conflicts with future inserts
SELECT setval('rent_rent_id_seq', 10);
SELECT setval('location_location_id_seq', 10);
SELECT setval('property_types_property_type_id_seq', 4);
SELECT setval('amenities_amenity_id_seq', 10);

-- ----------------------------------------
-- Landlord emails (for account records)
-- auth_user_id left NULL — set on real signup
-- ----------------------------------------
UPDATE landlords SET email = 'kostas.papadopoulos@email.gr' WHERE landlord_id = '0001';
UPDATE landlords SET email = 'maria.georgiou@email.gr'       WHERE landlord_id = '0002';
UPDATE landlords SET email = 'nikos.dimitriou@email.gr'      WHERE landlord_id = '0003';
UPDATE landlords SET email = 'elena.katsarou@email.gr'       WHERE landlord_id = '0004';
UPDATE landlords SET email = 'a.tsimikas@email.gr'           WHERE landlord_id = '0005';

-- ----------------------------------------
-- Sample student inquiries (8 rows)
-- ----------------------------------------
INSERT INTO inquiries (listing_id, student_name, student_email, student_phone, message, faculty_id, status) VALUES
  ('0001001', 'Dimitris Alexiou',   'dim.alex@auth.gr',        '+30 69 1111 2222',
   'Hi, I am a first-year Engineering student at AUTH. Is the studio still available from September? I would love to arrange a viewing.',
   'auth-main', 'pending'),

  ('0001002', 'Sofia Papageorgiou', 'sofia.p@uom.edu.gr',      NULL,
   'Hello, I study Business at UoM and I am looking for a 1-bedroom near the city center. Could you tell me if utilities are included?',
   'uom-main', 'replied'),

  ('0002001', 'Nikos Stavrakis',    'n.stavrakis@students.ihu.gr', '+30 69 3333 4444',
   'I am looking for a 2-bedroom apartment to share with a classmate. We both attend IHU Thermi. Is a 12-month lease possible?',
   'ihu-thermi', 'pending'),

  ('0003002', 'Anna Christodoulou', 'anna.chris@auth.gr',       NULL,
   'Dear landlord, I am a Medical School student and I found your studio close to my campus. Is it available in October? What is the deposit?',
   'auth-medical', 'pending'),

  ('0004001', 'Petros Makris',      'p.makris@uom.edu.gr',     '+30 69 5555 6666',
   'Good morning, I am interested in the 2-bedroom apartment. I have a friend who studies at UoM as well. Can we visit this weekend?',
   'uom-main', 'replied'),

  ('0004002', 'Eleni Vasileiou',    'e.vasi@students.auth.gr',  NULL,
   'Hello! I am looking for a studio close to AUTH. Your listing on Ethnikis Amynis looks perfect. Is it pet-friendly?',
   'auth-main', 'pending'),

  ('0005001', 'Kostas Georgas',     'k.georgas@ihu.gr',         '+30 69 7777 8888',
   'Hi there, I attend IHU Thermi and I am searching for a ground-floor apartment. Is the 1-bedroom still free for September?',
   'ihu-thermi', 'closed'),

  ('0005002', 'Maria Tsalikidou',   'mtsalik@auth.gr',          NULL,
   'Hi, I am a Veterinary student at AUTH Agriculture campus. The Stavroupoli room fits my budget. What bus line goes to campus?',
   'auth-agriculture', 'pending');
