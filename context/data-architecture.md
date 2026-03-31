# Data Architecture — Student Directory

---

## Write Pipeline (Data Input)

**COLLECT** → **INGEST** → **COMPUTE** → **STORE**

1. **Collect** — Michael provides data (existing landlord list, scraped data uploads, landlord requests).
2. **Ingest** — Batch ingestion. Each batch = a new listing or edits to an existing listing.
3. **Compute** — Normalize data: standardize fields, fill all dimensions, flag gaps. Precompute walking and public transport distances from each listing to every university faculty reference point.
4. **Store** — Data warehouse (PostgreSQL via Supabase) with star schema. Raw batch files are retained in a staging layer (`data/raw/`) for debugging and reprocessing before normalized records are written to the warehouse tables.

---

## Star Schema

### Fact Table: `listing`
- `listing_id` — composite key, format `LLLLNNN` (7 digits, no hyphen: 4-digit landlord ID + 3-digit listing suffix)
- References to all dimension tables

### Dimensions
- **Rent** — monthly price, currency, bills included (yes/no), deposit info
- **Location** — address, neighborhood, coordinates (for distance computation)
- **Property Type** — studio, 1-bedroom, 2-bedroom, room, etc.
- **Amenities** — AC, furnished, balcony, elevator, parking, etc. (positive features stored here; quiz dealbreakers are inverse filters on these same fields)
- **Landlord** — landlord/company name, contact info, landlord ID (first 4 digits of listing_id)
- **Faculty Distances** — precomputed walk + transit time from listing to each university faculty reference point (AUTH Faculty of X, UoM Faculty of Y, IHU Faculty of Z, etc.). Nearby faculties may share a single reference point.

---

## Read Pipeline (UI)

### Quiz Flow
1. Student takes a multi-select quiz covering:
   - Which faculty will you study at?
   - Rental duration
   - Budget upper bound
   - Property type (multi-select: studio / 1-bed / 2-bed / room)
   - Dealbreakers to avoid (multi-select: ground floor / no AC / bills not included / etc.)
2. Dealbreaker selections filter OUT listings that match those negative traits (inverse filter on amenities/features).

### Results View
- Filtered list of listings showing relevant dimensions
- "Time to faculty" column (walk + public transport) based on selected faculty — precomputed, not calculated on the fly
- All dimension columns sortable ascending/descending

### Detail View (click on a listing)
- Full photo gallery
- All dimensions displayed
- Description text
- Contact/chat with landlord (future feature — requires student account)

---

## ID System

Format: `LLLLNNN` (7 digits, no hyphen)
- `LLLL` — 4-digit landlord ID, starting from `0100` (supports up to 9,999 landlords; ~1,000 expected)
- `NNN` — 3-digit listing suffix (up to 999 listings per landlord)
- Example: `0100001` = landlord 0100, listing 001
- Manually assigned during the cleaning/ingestion step
