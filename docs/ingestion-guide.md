# Data Ingestion Guide

Step-by-step instructions for adding new listings to the Student Housing Directory.

---

## Prerequisites

```bash
cd StudentDirectory
pip install -r scripts/requirements.txt
```

Set your Supabase connection. You need **one** of:

| Method | Variables needed |
|--------|----------------|
| REST API (ingest.py) | `SUPABASE_URL`, `SUPABASE_KEY` |
| Direct SQL (apply_and_load.py) | `DATABASE_URL` (PostgreSQL connection string) |

```bash
# Option A: REST API
export SUPABASE_URL="https://ecluqurlfbvkxrnoyhaq.supabase.co"
export SUPABASE_KEY="your-service-role-key"

# Option B: Direct (session pooler for IPv4)
export DATABASE_URL="postgresql://postgres.ecluqurlfbvkxrnoyhaq:PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
```

---

## 1. Prepare a Batch File

### CSV format

Use `templates/batch_template.csv` as a starting point. Every column is documented below.

```
listing_id,landlord_id,landlord_name,contact_info,address,neighborhood,lat,lng,monthly_price,currency,bills_included,deposit,property_type,amenities,description
```

### JSON format

Identical fields, but as an array of objects. Amenities can be a JSON array instead of a comma-separated string:

```json
[
  {
    "landlord_id": "0006",
    "landlord_name": "Dimitra Vlachou",
    "contact_info": "+30 2310 555123",
    "address": "Mitropoleos 30",
    "neighborhood": "Kentro",
    "lat": 40.6335,
    "lng": 22.9445,
    "monthly_price": 290,
    "currency": "EUR",
    "bills_included": false,
    "deposit": 290,
    "property_type": "Studio",
    "amenities": ["AC", "Furnished", "Heating"],
    "description": "Renovated studio near Aristotelous Square."
  }
]
```

### Column Reference

#### Required fields

These must be present and non-empty or the row will be rejected.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `landlord_id` | String (4 digits) | Unique landlord identifier. Reuse for the same landlord across listings. | `"0100"` |
| `landlord_name` | String | Landlord or company name. | `"The Upper Town"` |
| `address` | String | Street address. Can be approximate if exact is unknown. | `"Tsimiski 45"` |
| `neighborhood` | String | Thessaloniki neighborhood. | `"Kentro"` |
| `lat` | Number | Latitude. Must be within 40.58–40.68. | `40.6335` |
| `lng` | Number | Longitude. Must be within 22.90–22.98. | `22.9445` |
| `monthly_price` | Number or null | Monthly rent in EUR. Set to null/empty if landlord doesn't publish price. | `290` |
| `property_type` | String | Must match a known type (see below). | `"Studio"` |

#### Optional fields

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `listing_id` | String (7 digits) | Auto-assigned | Format: `LLLLNNN` (landlord_id + 3-digit sequence). Leave blank to auto-assign. |
| `contact_info` | String | `"N/A"` | Phone, email, or website URL. Also accepted as `landlord_contact`. |
| `currency` | String | `"EUR"` | Always EUR for Thessaloniki. |
| `bills_included` | Boolean | `false` | Whether utilities are included in rent. Accepts: `true/false`, `yes/no`, `1/0`. |
| `deposit` | Number | Same as price | Security deposit in EUR. Null if unknown. |
| `amenities` | String or Array | `[]` | Comma-separated (CSV) or JSON array. See canonical names below. |
| `description` | String | empty | Free-text listing description. |
| `photos` | Array | `[]` | JSON array of photo URLs (JSON input only). |
| `sqm` | Number | null | Floor area in square meters. |
| `floor` | Number | null | Floor number (0 = ground). |
| `source_url` | String | null | Original listing URL for reference. |
| `available_from` | Date string | null | Format: `YYYY-MM-DD`. |
| `rental_duration` | String | null | E.g., `"academic_year"`, `"12_months"`. |
| `flags` | Object | `{}` | Data quality flags (JSON input only). See below. |

#### Property types (exact match, case-insensitive)

| Input value | Stored as |
|-------------|-----------|
| `studio` | Studio |
| `1-bedroom` or `1-bed` | 1-Bedroom |
| `2-bedroom` or `2-bed` | 2-Bedroom |
| `2-bedroom (x2)` | 2-Bedroom (x2) |
| `room` | Room in shared apartment |

#### Amenity names (canonical)

When using CSV, separate with commas: `"AC,Furnished,Balcony"`

| Canonical name | Aliases also accepted |
|---------------|----------------------|
| AC | ac |
| Furnished | furnished |
| Balcony | balcony |
| Elevator | elevator |
| Parking | parking |
| Ground floor | ground_floor |
| Washing machine | washing_machine |
| Dishwasher | dishwasher |
| Internet included | internet_included |
| Heating | heating |
| Wi-Fi | wifi, wi-fi |
| TV | tv |
| Kitchen | kitchen |
| Double glazed windows | double_glazed_windows |
| Weekly cleaning | weekly_cleaning |
| Microwave | microwave |
| Oven | oven |
| Gas heating | gas_heating |
| Private yard | private_yard |

Unrecognized amenity names are kept as-is and inserted into the `amenities` table.

#### Data quality flags

For listings with incomplete data, add flags to explain what's missing:

```json
"flags": {
  "PRICE_MISSING": "Landlord doesn't publish price — contact required",
  "COORDS_APPROXIMATE": "Lat/lng estimated from neighborhood, not exact pin",
  "ADDRESS_APPROXIMATE": "Only neighborhood known, no street address"
}
```

---

## 2. Run the Ingestion Script

```bash
# CSV input
python3 scripts/ingest.py data/batches/my_new_batch.csv

# JSON input
python3 scripts/ingest.py data/batches/my_new_batch.json
```

What happens:
1. The raw file is copied to `data/raw/batch_YYYY-MM-DD_HH-MM.{ext}` (staging backup)
2. Every row is validated against required fields, coordinate bounds, and property types
3. Invalid rows are written to `{input_stem}_validation_errors.json`
4. Valid rows are upserted into Supabase (landlords → rent → location → listings → amenities)
5. A summary is printed: `X inserted, Y updated, Z errors`

### Listing ID assignment

If `listing_id` is blank, the script auto-assigns one:
- Queries Supabase for the highest existing sequence for that landlord
- Increments by 1
- Format: `{landlord_id}{NNN}` — e.g., landlord `0006` gets `0006001`, `0006002`, etc.

If `listing_id` is provided and matches the `^\d{7}$` format, it's used as-is.

---

## 3. Compute Faculty Distances

After ingestion, run the distance precomputation script to fill the `faculty_distances` table:

```bash
python3 scripts/compute_distances.py
```

What happens:
1. Fetches all listings with their lat/lng from Supabase
2. Fetches all 6 faculty reference points
3. For each listing×faculty pair, calls OSRM twice:
   - `foot` profile → `walk_minutes`
   - `driving` profile × 1.5 → `transit_minutes` (approximation)
4. Rate-limited to 1 request/second (public OSRM server)
5. Upserts results into `faculty_distances`

**Estimated time:** ~2.2 seconds per pair. For 12 new listings × 6 faculties = 72 pairs ≈ 2.6 minutes.

---

## 4. Validate the Result

```bash
python3 scripts/validate_data.py
```

This checks the live database for: null dimensions, missing distances, ID format, orphaned records, and price sanity. See `scripts/validate_data.py` for details.

---

## Common Data Cleaning Tips

### Greek character encoding

Always save files as **UTF-8**. Greek characters (Οδός, Θεσσαλονίκη) work fine in UTF-8 CSV/JSON. If you see `Î˜ÎµÏƒÏƒÎ±Î»Î¿Î½Î¯ÎºÎ·` instead of Greek text, the file was saved in Latin-1 — re-save as UTF-8.

```bash
# Check encoding
file -I data/batches/my_batch.csv
# Convert if needed
iconv -f ISO-8859-7 -t UTF-8 bad.csv > good.csv
```

### Price format

- Use plain numbers: `320`, not `€320`, not `320.00 EUR`, not `320,00`
- Leave blank or `null` if the landlord doesn't publish a price — don't invent one
- The ingestion script strips whitespace and parses floats

### Coordinate validation

Thessaloniki bounds enforced by the database:
- **Latitude:** 40.55 – 40.70 (south Kalamaria to north Evosmos)
- **Longitude:** 22.80 – 23.05 (west Sindos to east Thermi)

The ingestion script uses tighter bounds (40.58–40.68, 22.90–22.98) for the city center. Listings near IHU Thermi or Sindos may need the wider DB bounds.

**Getting coordinates:**
1. Find the building on Google Maps
2. Right-click → "What's here?" or copy coordinates from the URL
3. Format: `lat, lng` (Google Maps order matches our schema)

If you only know the neighborhood, use an approximate center point and add a `COORDS_APPROXIMATE` flag.

### Address strings

- Trim whitespace — the script does this automatically
- Use the Greek street name in Latin characters: `"Tsimiski 45"`, not `"Τσιμισκή 45"` (unless the full app supports Greek input)
- Include the street number when known
- If only the neighborhood is known: `"Ano Poli, Thessaloniki"` and flag with `ADDRESS_APPROXIMATE`

### Deduplication

The script uses `listing_id` as the primary key for upserts. If you re-run a batch with the same `listing_id` values, existing records are **updated** (not duplicated). This is safe for re-processing.

---

## Pipeline Summary

```
CSV/JSON batch
     │
     ▼
 ┌───────────┐    ┌──────────────┐
 │ ingest.py │───▶│ data/raw/    │  (staging backup)
 └─────┬─────┘    └──────────────┘
       │
       ▼
 ┌─────────────┐
 │  Validate   │──▶ _validation_errors.json (if any)
 └─────┬───────┘
       │
       ▼
 ┌──────────────────┐
 │ Upsert to        │
 │ Supabase tables  │
 └─────┬────────────┘
       │
       ▼
 ┌─────────────────────┐
 │ compute_distances.py │──▶ faculty_distances table
 └─────────────────────┘
       │
       ▼
 ┌───────────────────┐
 │ validate_data.py  │──▶ pass/fail summary
 └───────────────────┘
```
