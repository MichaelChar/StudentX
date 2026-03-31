# Schema Documentation — Student Housing Directory

## Overview

Star schema with `listings` as the central fact table, connected to dimension tables for rent, location, property type, amenities, landlord, and faculty distances.

```
                    ┌──────────────┐
                    │  landlords   │
                    └──────┬───────┘
                           │
┌──────────┐    ┌──────────┴───────────┐    ┌────────────────┐
│   rent   ├────┤      listings        ├────┤ property_types │
└──────────┘    │     (fact table)     │    └────────────────┘
                └──┬───────────────┬───┘
┌──────────┐       │               │       ┌───────────────────┐
│ location ├───────┘               └───────┤ listing_amenities │
└──────────┘                               └────────┬──────────┘
                                                    │
┌───────────────────┐    ┌──────────┐    ┌──────────┴──────────┐
│ faculty_distances ├────┤ listings │    │     amenities       │
└────────┬──────────┘    └──────────┘    └─────────────────────┘
         │
┌────────┴──────────┐
│    faculties      │
└───────────────────┘
```

---

## ID System

**Format:** `LLLLLNN` (7 digits, no separator)

| Segment | Digits | Description |
|---------|--------|-------------|
| `LLLL` | 4 | Landlord ID (supports up to 9,999 landlords) |
| `NNN` | 3 | Listing sequence (up to 999 listings per landlord) |

**Example:** `0100003` = landlord `0100`, listing sequence `003`

The `listings` table enforces that the first 4 characters of `listing_id` match the `landlord_id` foreign key via a CHECK constraint.

---

## Tables

### `landlords`

Landlord/company information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `landlord_id` | TEXT | PK, CHECK `^\d{4}$` | 4-digit landlord identifier |
| `name` | TEXT | NOT NULL | Landlord or company name |
| `contact_info` | TEXT | NOT NULL | Phone, email, or website URL |

### `rent`

Pricing information for a listing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `rent_id` | SERIAL | PK | Auto-increment ID |
| `monthly_price` | NUMERIC | CHECK > 0 (nullable) | Monthly rent in EUR. NULL = not publicly listed |
| `currency` | TEXT | NOT NULL, DEFAULT 'EUR' | Currency code |
| `bills_included` | BOOLEAN | DEFAULT false (nullable) | Whether utility bills are included. NULL = unknown |
| `deposit` | NUMERIC | CHECK >= 0 (nullable) | Required deposit. NULL = not listed |

**Index:** `idx_rent_monthly_price` on `monthly_price`

### `location`

Geographic information for a listing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `location_id` | SERIAL | PK | Auto-increment ID |
| `address` | TEXT | NOT NULL | Street address (may be approximate) |
| `neighborhood` | TEXT | NOT NULL | Thessaloniki neighborhood name |
| `lat` | NUMERIC | NOT NULL, CHECK 40.55–40.70 | Latitude |
| `lng` | NUMERIC | NOT NULL, CHECK 22.80–23.05 | Longitude |

**Index:** `idx_location_neighborhood` on `neighborhood`

### `property_types`

Enumeration of property categories.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `property_type_id` | SERIAL | PK | Auto-increment ID |
| `name` | TEXT | NOT NULL, UNIQUE | Type name |

**Values:** Studio, 1-Bedroom, 2-Bedroom, 2-Bedroom (x2), Room in shared apartment

### `amenities`

Enumeration of property features.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `amenity_id` | SERIAL | PK | Auto-increment ID |
| `name` | TEXT | NOT NULL, UNIQUE | Amenity name |

**Values:** AC, Furnished, Balcony, Elevator, Parking, Ground floor, Washing machine, Dishwasher, Internet included, Heating, Wi-Fi, TV, Kitchen, Double glazed windows, Weekly cleaning, Microwave, Oven, Gas heating, Private yard

### `faculties`

University faculty reference points with real coordinates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `faculty_id` | TEXT | PK | Slug identifier (e.g., `auth-main`) |
| `name` | TEXT | NOT NULL | Display name |
| `university` | TEXT | NOT NULL, CHECK IN (AUTH, UoM, IHU) | Parent university |
| `lat` | NUMERIC | NOT NULL | Latitude |
| `lng` | NUMERIC | NOT NULL | Longitude |

**Reference points:**

| ID | University | Covers |
|----|-----------|--------|
| `auth-main` | AUTH | Engineering, Sciences, Philosophy, Law, Economics, Theology, Education, Fine Arts |
| `auth-medical` | AUTH | Medicine, Dentistry, Pharmacy, Veterinary |
| `auth-agriculture` | AUTH | Agriculture, Forestry |
| `uom-main` | UoM | All UoM faculties (Economics, Business, Social Sciences, Applied Informatics) |
| `ihu-thermi` | IHU | Main IHU campus |
| `ihu-sindos` | IHU | Engineering/industrial programs |

### `listings` (Fact Table)

Central table connecting all dimensions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `listing_id` | TEXT | PK, CHECK `^\d{7}$` | 7-digit composite ID (LLLLLNN format) |
| `landlord_id` | TEXT | NOT NULL, FK → landlords | Must match first 4 chars of listing_id |
| `rent_id` | INTEGER | NOT NULL, FK → rent | Associated rent record |
| `location_id` | INTEGER | NOT NULL, FK → location | Associated location record |
| `property_type_id` | INTEGER | NOT NULL, FK → property_types | Property category |
| `description` | TEXT | — | Free-text listing description |
| `photos` | TEXT[] | DEFAULT '{}' | Array of photo URLs |
| `sqm` | INTEGER | CHECK > 0 (nullable) | Square meters. NULL = not listed |
| `floor` | INTEGER | — (nullable) | Floor number. NULL = not listed |
| `source_url` | TEXT | — (nullable) | Original listing URL |
| `available_from` | DATE | — (nullable) | Earliest availability date |
| `rental_duration` | TEXT | — (nullable) | Typical rental period (e.g., "academic_year") |
| `flags` | JSONB | DEFAULT '{}' | Data quality flags (PRICE_MISSING, COORDS_APPROXIMATE, etc.) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update time (auto-trigger) |

**Indexes:** `idx_listings_property_type_id`, `idx_listings_landlord_id`, `idx_listings_rent_id`, `idx_listings_location_id`

**Trigger:** `trigger_listings_updated_at` — auto-updates `updated_at` on row modification.

### `listing_amenities` (Join Table)

Many-to-many relationship between listings and amenities.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `listing_id` | TEXT | PK (composite), FK → listings, ON DELETE CASCADE | Listing reference |
| `amenity_id` | INTEGER | PK (composite), FK → amenities, ON DELETE CASCADE | Amenity reference |

**Index:** `idx_listing_amenities_amenity_id` on `amenity_id`

### `faculty_distances` (Precomputed)

Walk and transit times from each listing to each faculty.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `listing_id` | TEXT | PK (composite), FK → listings, ON DELETE CASCADE | Listing reference |
| `faculty_id` | TEXT | PK (composite), FK → faculties, ON DELETE CASCADE | Faculty reference |
| `walk_minutes` | INTEGER | NOT NULL, CHECK >= 0 | Walking time in minutes (OSRM foot profile) |
| `transit_minutes` | INTEGER | NOT NULL, CHECK >= 0 | Transit time in minutes (OSRM driving × 1.5) |

**Index:** `idx_faculty_distances_faculty_id` on `faculty_id`

---

## Data Quality Flags

Listings from real scraped data may have incomplete information. The `flags` JSONB column records known data quality issues:

| Flag | Meaning |
|------|---------|
| `PRICE_MISSING` | Landlord does not publish price — contact required |
| `DEPOSIT_MISSING` | Deposit terms not listed |
| `BILLS_UNKNOWN` | Whether bills are included is not specified |
| `ADDRESS_APPROXIMATE` | Only neighborhood known, no exact street address |
| `COORDS_APPROXIMATE` | Lat/lng estimated from area, not exact building pin |
| `ELEVATOR_UNKNOWN` | Not mentioned on source website |
| `BALCONY_UNKNOWN` | Not mentioned on source website |
| `PARKING_UNKNOWN` | Not mentioned on source website |

---

## Data Validation Rules

| Rule | Table | Constraint |
|------|-------|-----------|
| Landlord ID is exactly 4 digits | landlords | `CHECK (landlord_id ~ '^\d{4}$')` |
| Listing ID is 7-digit LLLLLNN | listings | `CHECK (listing_id ~ '^\d{7}$')` |
| Listing ID prefix matches landlord | listings | `CHECK (LEFT(listing_id, 4) = landlord_id)` |
| Rent positive when present | rent | `CHECK (monthly_price IS NULL OR monthly_price > 0)` |
| Deposit non-negative when present | rent | `CHECK (deposit IS NULL OR deposit >= 0)` |
| Coordinates within Thessaloniki | location | `CHECK (lat BETWEEN 40.55 AND 40.70)`, `CHECK (lng BETWEEN 22.80 AND 23.05)` |
| Distance times non-negative | faculty_distances | `CHECK (walk_minutes >= 0)`, `CHECK (transit_minutes >= 0)` |
| University must be valid | faculties | `CHECK (university IN ('AUTH', 'UoM', 'IHU'))` |

---

## Migration Files

| File | Purpose |
|------|---------|
| `supabase/migrations/001_create_schema.sql` | All tables, constraints, indexes, triggers |
| `supabase/migrations/002_seed_faculties.sql` | Faculty reference data (6 points) |
| `supabase/migrations/003_schema_evolution.sql` | Schema evolution for real-world data (nullable prices, new columns, new amenities) |
| `supabase/seed.sql` | 10 seed listings with all dimensions (7-digit IDs) |

---

## Scripts

| File | Purpose |
|------|---------|
| `scripts/ingest.py` | CSV/JSON batch ingestion → Supabase (validate, normalize, upsert) |
| `scripts/compute_distances.py` | OSRM-based walk/transit distance precomputation |
| `scripts/load_and_validate.py` | Full pipeline: load all data, validate, compute distances, export |
| `scripts/requirements.txt` | Python dependencies |
