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

Landlord/company information. Auth and billing columns were added in later
migrations (004+); marketplace columns land in 100.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `landlord_id` | TEXT | PK, CHECK `^\d{4}$` | 4-digit landlord identifier |
| `name` | TEXT | NOT NULL | Landlord or company name |
| `contact_info` | TEXT | NOT NULL | Legacy free-text contact (email/phone/URL) |
| `auth_user_id` | UUID | UNIQUE, FK → auth.users | Supabase auth link (nullable until claimed) |
| `email` | TEXT | UNIQUE | Account email |
| `phone` | TEXT | — (nullable) | Phone / WhatsApp for video-call scheduling (100) |
| `avg_response_ms` | BIGINT | CHECK ≥ 0 (nullable) | Rolling average host response latency (100); anon SELECT granted in 101 for public ranking |
| `response_stats_at` | TIMESTAMPTZ | — (nullable) | When `avg_response_ms` was last recomputed (100); anon SELECT granted in 103 so public buckets can drop stale stats |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Account creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update time |

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
| `neighborhood` | TEXT | NOT NULL | Thessaloniki neighborhood name (free text; controlled list lives in `neighborhoods`) |
| `lat` | NUMERIC | nullable (post-014), CHECK 40.55–40.70 when set | Latitude |
| `lng` | NUMERIC | nullable (post-014), CHECK 22.80–23.05 when set | Longitude |

**Index:** `idx_location_neighborhood` on `neighborhood`

### `neighborhoods`

Controlled reference list for the listing form select and results facet
(migration 100). Seeded from `DISTINCT location.neighborhood` on apply, plus
explicit rows in `supabase/seed.sql` for fresh local stacks. `location.neighborhood`
stays free text (no FK) so ingest and legacy rows keep working.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `neighborhood_id` | SERIAL | PK | Auto-increment ID |
| `name` | TEXT | NOT NULL, UNIQUE | Canonical neighborhood label |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Row creation time |

**RLS:** public SELECT; writes are service_role / seed only.

### `property_types`

Enumeration of property categories.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `property_type_id` | SERIAL | PK | Auto-increment ID |
| `name` | TEXT | NOT NULL, UNIQUE | Type name |

**Values:** Studio, 1-Bedroom, 2-Bedroom, 2-Bedroom (x2), Room in shared apartment, Entire place (102), Bed in shared room (102)

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
| `title` | TEXT | NOT NULL | Card/heading title (038) |
| `description` | TEXT | — | Free-text listing description |
| `photos` | TEXT[] | DEFAULT '{}' | Array of photo URLs |
| `sqm` | INTEGER | CHECK > 0 (nullable) | Square meters. NULL = not listed |
| `floor` | INTEGER | — (nullable) | Floor number. NULL = not listed |
| `source_url` | TEXT | — (nullable) | Original listing URL |
| `available_from` | DATE | — (nullable) | Earliest availability date |
| `available_to` | DATE | — (nullable) | Latest availability end; NULL = open-ended (100) |
| `min_duration_months` | SMALLINT | CHECK 2..12 (nullable) | Minimum stay in months (037; widened 100) |
| `max_duration_months` | SMALLINT | CHECK 2..12, ≥ min when both set (nullable) | Maximum stay in months (100) |
| `bedrooms` | SMALLINT | CHECK ≥ 0 (nullable) | Bedroom count (100) |
| `bathrooms` | SMALLINT | CHECK ≥ 0 (nullable) | Bathroom count (100) |
| `agency_fee` | NUMERIC | CHECK ≥ 0 (nullable) | One-time agency fee disclosed on listing (100) |
| `video_url` | TEXT | — (nullable) | Optional listing video URL (100) |
| `smoking_allowed` | BOOLEAN | — (nullable) | House rule (100) |
| `pets_allowed` | BOOLEAN | — (nullable) | House rule (100) |
| `additional_rules` | TEXT | — (nullable) | Free-text house rules (100) |
| `listing_status` | TEXT | NOT NULL, DEFAULT `disabled`, CHECK IN (`active`, `disabled`) | Public visibility; disabled listings are landlord-only (102). Default flipped to `disabled` in 104 — `active` is set **only** by admin go-live (`/api/admin/listing-go-live`), never by a landlord write. Any INSERT that wants a publicly visible row must say so explicitly. |
| `flags` | JSONB | DEFAULT '{}' | Data quality flags (PRICE_MISSING, COORDS_APPROXIMATE, etc.) plus the listing pipeline stage: `listing_status` (`draft` → `submitted` → `live`/`disabled`) and the admin go-live stamp (`admin_live_approved`, `admin_live_at`, `admin_live_by`) — see `src/lib/listingGoLive.js` (104) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update time (auto-trigger) |

**Indexes:** `idx_listings_property_type_id`, `idx_listings_landlord_id`, `idx_listings_rent_id`, `idx_listings_location_id`, `idx_listings_min_duration_months`, `idx_listings_available_to`, `idx_listings_listing_status`

**Trigger:** `trigger_listings_updated_at` — auto-updates `updated_at` on row modification.

**Note:** The landlord listings API still hard-validates `min_duration_months ∈ {1,5,9}`; migration 100 only widens the DB constraint so the API can loosen later without another schema change.

### `students`

Authenticated student accounts (migration 026). Guest-profile columns for the
host pre-accept view land in 100; all profile fields below are nullable so
existing rows keep working (completion is enforced at request-to-book in app code).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `student_id` | UUID | PK, DEFAULT gen_random_uuid() | Student identifier |
| `auth_user_id` | UUID | UNIQUE NOT NULL, FK → auth.users | Supabase auth link |
| `email` | TEXT | UNIQUE NOT NULL, lowercase | Account email |
| `display_name` | TEXT | NOT NULL | Display name |
| `preferred_locale` | TEXT | NOT NULL | UI locale preference |
| `date_of_birth` | DATE | — (nullable) | DOB; age derived for host view (100) |
| `gender` | TEXT | — (nullable) | Guest gender (100) |
| `nationality` | TEXT | — (nullable) | Nationality (100) |
| `languages` | TEXT[] | NOT NULL, DEFAULT '{}' | Spoken languages (100) |
| `bio` | TEXT | — (nullable) | Short bio shown to host (100) |
| `home_university` | TEXT | — (nullable) | Home / sending university (100) |
| `receiving_university` | TEXT | — (nullable) | Host-city university (100) |
| `receiving_faculty` | TEXT | — (nullable) | Faculty / programme (100) |
| `funding_source` | TEXT | — (nullable) | How the stay is funded (100) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Account creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update time |

**RLS:** students may SELECT/UPDATE only their own row (`auth_user_id = auth.uid()`). INSERT via SECURITY DEFINER RPC / auth trigger.

### `inquiries`

Student ↔ landlord contact threads for a listing (migration 004; chat columns
in 026). When a booking request opens a thread, `booking_id` links them
(migration 101). Before 101 the link lived only in `booking_events.metadata`
(`kind = 'inquiry_linked'`).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `inquiry_id` | UUID | PK | Thread ID |
| `listing_id` | TEXT | NOT NULL, FK → listings ON DELETE CASCADE | Listing under discussion |
| `student_name` | TEXT | NOT NULL | Name at thread open |
| `student_email` | TEXT | NOT NULL | Email at thread open |
| `student_phone` | TEXT | — (nullable) | Phone at thread open |
| `message` | TEXT | NOT NULL, length ≥ 10 | Opening message |
| `faculty_id` | TEXT | — (nullable), FK → faculties | Optional faculty context |
| `status` | TEXT | NOT NULL, DEFAULT `pending` | `pending` · `replied` · `closed` |
| `replied_at` | TIMESTAMPTZ | — (nullable) | First landlord reply time |
| `student_user_id` | UUID | — (nullable), FK → auth.users | Authenticated student (026) |
| `booking_id` | UUID | — (nullable), FK → bookings ON DELETE SET NULL | Linked booking when request-to-book opened the thread (101) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Thread open time |

**Indexes:** `idx_inquiries_listing_id`, `idx_inquiries_status`, `idx_inquiries_created_at`, `idx_inquiries_student_user_id`, `idx_inquiries_booking_id` (partial, non-null)

**RLS:** students SELECT/INSERT own rows (`student_user_id = auth.uid()`);
landlords SELECT/UPDATE rows for their listings. Row policies are unchanged by
`booking_id` (101) — who can read or write a thread is the same as before.

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

### `universities` (migration 066)

City-scoped university reference points for landlord-authored distances.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `university_id` | TEXT | PK | Slug (e.g. `auth`, `uom`, `ihu`) |
| `city_slug` | TEXT | NOT NULL | Matches `SUPPORTED_CITIES` |
| `name` | TEXT | NOT NULL | Full display name |
| `short_name` | TEXT | NOT NULL | Card label (AUTH, UoM, IHU) |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | Dropdown order |

**RLS:** public SELECT; writes via migration/seed only.

### `listing_university_distances` (migration 066; `source` in 102)

Landlord-reported metres from a listing to each university (not OSRM;
`faculty_distances` remains the walk/transit-minute table).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `listing_id` | TEXT | PK (composite), FK → listings ON DELETE CASCADE | Listing |
| `university_id` | TEXT | PK (composite), FK → universities ON DELETE CASCADE | University |
| `distance_meters` | INTEGER | NOT NULL, CHECK 1..50000 | Self-reported metres |
| `source` | TEXT | NOT NULL, DEFAULT `landlord`, CHECK IN (`landlord`, `computed`) | Typed vs map-pin prefill (102) |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update |

**Index:** `idx_lud_university_id` on `university_id`

**RLS:** public SELECT; landlords ALL on rows for their own listings.

---

## Marketplace tables (migration 100)

### `listing_availability_blocks`

Per-listing calendar holds for the booking marketplace (W1).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `block_id` | UUID | PK | Row ID |
| `listing_id` | TEXT | NOT NULL, FK → listings ON DELETE CASCADE | Listing |
| `start_date` | DATE | NOT NULL | Inclusive start |
| `end_date` | DATE | NOT NULL, ≥ start_date | Inclusive end |
| `kind` | TEXT | NOT NULL, IN (`booked`, `pending`, `blackout`) | Block type |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Created |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Updated |

**RLS:** public SELECT (calendar is browse-visible). Landlords ALL on blocks for their own listings. Pending/booked rows are normally written by the service role when bookings transition.

### `bookings`

Reservation request / stay record (W2). No payment states in this phase —
`confirmed` means the landlord accepted and parties settle offline;
`moved_in` means the student confirmed move-in looked good (103).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `booking_id` | UUID | PK | Booking ID |
| `student_id` | UUID | NOT NULL, FK → students ON DELETE RESTRICT | Guest |
| `listing_id` | TEXT | NOT NULL, FK → listings ON DELETE RESTRICT | Listing |
| `move_in` | DATE | NOT NULL | Requested check-in |
| `move_out` | DATE | NOT NULL, > move_in | Requested check-out |
| `monthly_rent` | NUMERIC | NOT NULL, > 0 | Rent snapshot at request time |
| `total_stay_value` | NUMERIC | NOT NULL, > 0 | Full-stay value snapshot |
| `state` | TEXT | NOT NULL, DEFAULT `requested` | See states below |
| `last_activity_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Inactivity / expiry timer input |
| `accepted_at` | TIMESTAMPTZ | — (nullable) | When host accepted |
| `confirmed_at` | TIMESTAMPTZ | — (nullable) | When booking confirmed (offline settle) |
| `declined_at` | TIMESTAMPTZ | — (nullable) | When host declined |
| `expired_at` | TIMESTAMPTZ | — (nullable) | When accept/confirm window lapsed |
| `cancelled_at` | TIMESTAMPTZ | — (nullable) | When cancelled |
| `disputed_at` | TIMESTAMPTZ | — (nullable) | When disputed |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Request time (`requested`) |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last row update |

**States:** `requested` · `accepted` · `confirmed` · `moved_in` · `declined` · `expired` · `cancelled` · `disputed`

**RLS:**
- Student: SELECT / INSERT (own rows, insert only as `requested`) / UPDATE own rows
- Landlord: SELECT / UPDATE bookings whose listing belongs to them
- No public access (bookings carry personal data)

### `booking_events`

Append-only audit log of state transitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | UUID | PK | Event ID |
| `booking_id` | UUID | NOT NULL, FK → bookings ON DELETE CASCADE | Parent booking |
| `from_state` | TEXT | nullable; same enum as bookings when set | Prior state (NULL on create) |
| `to_state` | TEXT | NOT NULL | New state |
| `actor` | TEXT | NOT NULL, IN (`student`, `landlord`, `system`, `admin`) | Who caused the transition |
| `metadata` | JSONB | NOT NULL, DEFAULT `{}` | Extra context (no bank details) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Event time |

**RLS:** participants (student or listing's landlord) may SELECT and INSERT events for bookings they can see. No UPDATE/DELETE.

### `payouts`

Fee / transfer record modelled now so components can be persisted at booking
time (W3). **No bank details, ever** — collect payout coordinates out-of-band
or via Stripe later. Money movement is ops/manual until Connect lands.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `payout_id` | UUID | PK | Payout ID |
| `booking_id` | UUID | NOT NULL, UNIQUE, FK → bookings | One payout row per booking |
| `gross_rent` | NUMERIC | NOT NULL, ≥ 0 | First-month (or gross) rent held |
| `commission_net` | NUMERIC | NOT NULL, ≥ 0 | Host commission ex-VAT |
| `vat` | NUMERIC | NOT NULL, ≥ 0 | VAT on commission |
| `amount` | NUMERIC | NOT NULL, ≥ 0 | Amount due to landlord |
| `state` | TEXT | NOT NULL, DEFAULT `pending` | `pending` · `due` · `paid` · `cancelled` |
| `paid_at` | TIMESTAMPTZ | — (nullable) | When marked paid |
| `reference` | TEXT | — (nullable) | External transfer reference |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Created |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Updated |

**RLS:** student and listing landlord may SELECT their booking's payout. Writes are service_role / ops only.

### `property_verifications`

Video-call (or other) property verification record (W4 table early).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `verification_id` | UUID | PK | Verification ID |
| `listing_id` | TEXT | NOT NULL, FK → listings ON DELETE CASCADE | Listing verified |
| `method` | TEXT | NOT NULL, IN (`video_call`, `in_person`, `document`, `other`) | How it was verified |
| `status` | TEXT | NOT NULL, DEFAULT `pending`, IN (`pending`, `approved`, `rejected`) | Request lifecycle (103) |
| `verified_by` | TEXT | — (nullable) | Admin / operator identifier |
| `verified_at` | TIMESTAMPTZ | — (nullable) | Completion time; NULL until approved — public badge requires this set, not status alone |
| `checklist_json` | JSONB | NOT NULL, DEFAULT `{}` | Checklist answers (tick-box keys; not used for pending/rejected) |
| `notes` | TEXT | — (nullable) | Free-text notes |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Created |

**RLS:** public SELECT where `verified_at IS NOT NULL` (badge/tooltip). Landlords SELECT rows for their own listings (including in-progress). Writes are service_role / admin only.

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
| Min stay 2–12 months when set | listings | `CHECK (min_duration_months IS NULL OR BETWEEN 2 AND 12)` |
| Max stay 2–12 and ≥ min when set | listings | `listings_max_duration_months_check` |
| Booking move-out after move-in | bookings | `CHECK (move_out > move_in)` |
| Booking state enum | bookings | `requested`…`moved_in`…`disputed` (see above) |
| Property verification status | property_verifications | `pending` \| `approved` \| `rejected` |
| Availability block kind | listing_availability_blocks | `booked` \| `pending` \| `blackout` |
| No bank details on payouts | payouts | schema has no IBAN/account columns by design |

---

## Migration Files

| File | Purpose |
|------|---------|
| `supabase/migrations/001_create_schema.sql` | All tables, constraints, indexes, triggers |
| `supabase/migrations/002_seed_faculties.sql` | Faculty reference data (6 points) |
| `supabase/migrations/003_schema_evolution.sql` | Schema evolution for real-world data (nullable prices, new columns, new amenities) |
| `supabase/migrations/100_marketplace_schema.sql` | Marketplace pivot: bookings, availability blocks, payouts, property verifications, neighborhoods, listing/student/landlord columns |
| `supabase/migrations/103_promote_state_columns.sql` | `bookings.state` + `moved_in`; `property_verifications.status`; anon GRANT on `landlords.response_stats_at` |
| `supabase/seed.sql` | 10 seed listings with all dimensions (7-digit IDs) + neighborhoods |

---

## Scripts

| File | Purpose |
|------|---------|
| `scripts/ingest.py` | CSV/JSON batch ingestion → Supabase (validate, normalize, upsert) |
| `scripts/compute_distances.py` | OSRM-based walk/transit distance precomputation |
| `scripts/load_and_validate.py` | Full pipeline: load all data, validate, compute distances, export |
| `scripts/requirements.txt` | Python dependencies |
