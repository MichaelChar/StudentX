# Dispatch Table — Student Directory

Send all prompts in a row simultaneously. Wait for all agents in a row to finish before moving to the next row.

---

## ROW 1 — Foundation (send A + B + C together)

### Agent A

```
You are building the data layer for a student housing directory in Thessaloniki, Greece. Tech: Supabase (PostgreSQL).

Task:
1. Create the Supabase schema implementing a star schema. Fact table: `listings` with `listing_id` as composite key (format LLLLNNN — 7 digits, no hyphen: 4-digit landlord ID starting from 0100 + 3-digit listing suffix). Dimension tables: `landlords` (name, contact_info, landlord_id), `rent` (monthly_price, currency, bills_included boolean, deposit), `location` (address, neighborhood, lat, lng), `property_types` (studio, 1-bed, 2-bed, room, etc.), `amenities` (AC, furnished, balcony, elevator, parking, ground_floor, etc. — stored as a join table `listing_amenities`), `faculty_distances` (precomputed walk_minutes and transit_minutes from each listing to each faculty reference point).
2. Create a faculty reference table (`faculties`) with all major Thessaloniki university faculties — AUTH, UoM, IHU — with their coordinates. Group nearby faculties under a single reference point where it makes sense. Research the real faculty locations.
3. Generate 10 realistic Thessaloniki seed listings with all dimensions filled — no nulls. Realistic Greek addresses, neighborhoods (Kalamaria, Toumba, Ano Poli, Kentro, etc.), realistic rent prices for student housing (200-600 EUR range).

Output:
- SQL migration files in `supabase/migrations/`
- Seed file in `supabase/seed.sql`
- `docs/schema.md` documenting every table, column, type, and relationship

Work ONLY in `supabase/` and `docs/`. Do not touch `src/`.
```

### Agent B

```
You are building the API layer for a student housing directory in Thessaloniki. Tech: Next.js 14+ App Router + Supabase client.

Task:
1. Initialize the Next.js project: `npx create-next-app@latest student-directory --app --tailwind --src-dir`. Install `@supabase/supabase-js`. Set up the Supabase client in `src/lib/supabase.js` reading NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from env. Create `.env.local.example` with placeholder values.
2. Create API route handlers in `src/app/api/`:
   - GET /api/listings — accepts query params: faculty (string), max_budget (number), types (comma-separated), duration (string), exclude_amenities (comma-separated dealbreaker IDs). Returns filtered listings with the relevant faculty distance columns. Supports sort_by and sort_order params.
   - GET /api/listings/[id] — returns full listing detail with all dimensions, all amenity names, all faculty distances, landlord info.
   - GET /api/faculties — returns all faculty reference points for the quiz dropdown.
3. For now, stub all endpoints with hardcoded mock JSON responses. The mock data shape must use this exact structure so swapping to real Supabase queries later is trivial:
   - listing object: { listing_id, address, neighborhood, monthly_price, currency, bills_included, deposit, property_type, amenities: [...], description, photos: [...], landlord: { name, contact_info }, faculty_distances: [{ faculty_name, walk_minutes, transit_minutes }] }
4. Document the response shape contracts in `docs/api-contracts.md`.

Work ONLY in `src/app/api/`, `src/lib/`, `docs/`, and project root config files. Do not touch `src/app/page.js`, `src/components/`, or `public/`.
```

### Agent C

```
You are building the frontend for a student housing directory in Thessaloniki. Tech: Next.js 14+ App Router + Tailwind CSS.

Design system:
- Minimalist, Bauhaus-inspired. Clean and functional.
- Fonts: Inter (body), Montserrat (headings) via Google Fonts.
- Colors: Navy #1B2A4A primary, Gold #C4953A accent, White #FFFFFF background, Dark gray #1F2937 text, Light gray #F3F4F6 accent backgrounds.
- Mobile-first. Generous whitespace. High contrast.
- Soft CTAs: "Find housing", "View details", "Get started". Never aggressive.

Task:
1. Build the layout shell in `src/app/layout.js`: import Inter + Montserrat from Google Fonts, set metadata (title: "Thessaloniki Student Housing Directory"), apply global styles in `src/app/globals.css` with the color palette as CSS variables.
2. Build `src/components/Navbar.js`: sticky top, site name "ThessHousing" on the left, nav links on the right (Home, Browse, About), hamburger + slide-out drawer on mobile.
3. Build `src/components/Footer.js`: dark navy background, site info, copyright with dynamic year.
4. Build the quiz page at `src/app/page.js`: a clean, single-page form with these fields:
   - Faculty (dropdown — hardcode these options for now: AUTH School of Engineering, AUTH School of Sciences, UoM School of Economics, IHU School of Technology, AUTH School of Medicine)
   - Rental duration (select: Semester, Academic Year, 12+ Months)
   - Budget upper bound (number input with range slider, 100-800 EUR)
   - Property type (multi-select checkboxes: Studio, 1-Bedroom, 2-Bedroom, Room in shared apartment)
   - Dealbreakers to avoid (multi-select checkboxes: Ground floor, No AC, Bills not included, No elevator, No furnished, Street-facing/noisy)
   - A "Find housing" submit button.
   On submit, encode selections as URL search params and navigate to /results.
5. Create placeholder pages at `src/app/results/page.js` and `src/app/listing/[id]/page.js` — just show "Results coming soon" and "Listing detail coming soon" styled consistently with the layout.

Work ONLY in `src/app/` (except `src/app/api/`), `src/components/`, `src/app/globals.css`, and `public/`. Do not touch `src/app/api/` or `src/lib/`.
```

---

## ROW 2 — Core Logic (send A + B + C together)

### Agent A

```
Continue building the data layer for the student housing directory.

Task:
1. Build a Python ingestion script at `scripts/ingest.py` that:
   - Takes a CSV or JSON batch file as input (path as CLI argument)
   - Copies the raw input file to `data/raw/` with a timestamped filename (e.g. `data/raw/batch_2026-03-28_14-30.csv`) as a staging layer before any processing — this preserves the original for debugging and reprocessing
   - Validates all required fields are present (address, neighborhood, lat, lng, monthly_price, property_type, landlord_name, landlord_id)
   - Assigns listing_id in format LLLLNNN (7 digits, no hyphen) if not already set (using landlord_id as the XXXX prefix, auto-incrementing YY per landlord)
   - Normalizes data: standardize price to EUR, clean/trim address strings, validate lat/lng are within Thessaloniki bounds (roughly 40.58-40.68 lat, 22.90-22.98 lng)
   - Flags any listing with missing or invalid dimensions in a `_validation_errors.json` output file
   - Upserts valid records into the Supabase tables (using supabase-py client)
   - Prints a summary: X inserted, Y updated, Z errors

2. Build a distance precomputation script at `scripts/compute_distances.py` that:
   - Reads all listings and all faculty reference points from Supabase
   - Uses the OSRM public API (router.project-osrm.org) to compute walk_minutes and transit_minutes for each listing-to-faculty pair
   - Writes results to the `faculty_distances` table
   - Handles rate limiting (add delays between requests)
   - Prints progress as it runs

3. Create `templates/batch_template.csv` with all expected column headers and 2 example rows.

4. Add a `scripts/requirements.txt` with all Python dependencies.

Work ONLY in `scripts/` and `templates/`. Do not touch `src/` or `supabase/`.
```

### Agent B

```
Continue building the API layer for the student housing directory. The Supabase schema is now finalized — read `supabase/migrations/` and `docs/schema.md` for the exact table and column names.

Task:
1. Replace all mock stubs in the API routes with real Supabase queries:
   - GET /api/listings: query the listings fact table joined with all dimension tables. Filter by: max_budget (rent.monthly_price <=), types (property_type IN list), exclude_amenities (listings that do NOT have these amenities — use a NOT EXISTS or LEFT JOIN exclusion on listing_amenities), duration. Join faculty_distances filtered to the selected faculty param so the response includes walk_minutes and transit_minutes for that faculty only. Support sort_by (price, walk_minutes, transit_minutes) and sort_order (asc, desc). Default sort: price asc.
   - GET /api/listings/[id]: full join across all dimension tables, return ALL faculty distances (not just one), all amenities as an array of names, landlord info, photos, description.
   - GET /api/faculties: select all from the faculties reference table, return id, name, and university.

2. Add error handling: 400 for missing/invalid params with a descriptive message, 404 for listing not found, 500 with a generic error message (don't leak internals).

3. Update `docs/api-contracts.md` with the final response shapes now that they reflect real data.

Work ONLY in `src/app/api/`, `src/lib/`, and `docs/`. Do not touch `src/components/`, `src/app/page.js`, or `supabase/`.
```

### Agent C

```
Continue building the frontend for the student housing directory. Read `docs/api-contracts.md` for the exact API response shapes.

Design reminder: Minimalist, high contrast, Navy #1B2A4A / Gold #C4953A / White / Dark gray #1F2937. Inter body, Montserrat headings. Mobile-first. Soft CTAs.

Task:
1. Build `src/app/results/page.js`:
   - Read quiz selections from URL search params
   - Call GET /api/listings with those params
   - Display results in a sortable card grid (1 col mobile, 2 col tablet, 3 col desktop)
   - Each card shows: listing photo thumbnail, address + neighborhood, monthly price (EUR), property type, "X min walk / Y min transit to [Faculty]", small pills for key amenities (AC, Furnished, etc.)
   - Column/sort controls at the top: clickable sort options for Price, Walk time, Transit time — each toggles asc/desc
   - Each card links to /listing/[listing_id]
   - Empty state: "No listings match your criteria. Try adjusting your filters." with a link back to the quiz
   - Loading state: show skeleton cards while fetching

2. Build `src/app/listing/[id]/page.js`:
   - Call GET /api/listings/[id]
   - Photo gallery: grid of images (or single hero image if only one photo)
   - Price displayed prominently with a badge for bills included/not included
   - Property details: type, neighborhood, address in a clean info section
   - Amenities displayed as pill/badge list
   - All faculty distances in a compact table (Faculty | Walk | Transit)
   - Description text
   - "Contact landlord" button — disabled with tooltip "Coming soon"
   - Back link to results

3. Build `src/components/ListingCard.js` as the reusable card component used in the results grid.

Work ONLY in `src/app/results/`, `src/app/listing/`, `src/components/`, and `public/`. Do not touch `src/app/api/`, `src/app/page.js`, or `src/lib/`.
```

---

## ROW 2.5 — Data Preparation (MANUAL STEP — Michael + Claude in Cowork)

> **This is not an agent row.** This is a hands-on step where Michael uploads his real landlord data (CSV, spreadsheet, scraped JSON, etc.) and works with Claude in Cowork to clean and map it into the `templates/batch_template.csv` format produced by Agent A in Row 2.

### What happens here:
1. Michael uploads raw data (his existing landlord list, scraped data, or both)
2. Claude helps clean, deduplicate, and normalize the data:
   - Map raw columns to the template columns
   - Assign landlord IDs (LLLL, starting from 0100) and listing IDs (LLLLNNN, 7 digits no hyphen)
   - Fill missing fields where possible, flag what needs manual input
   - Validate coordinates, prices, property types
   - Handle Greek/English text encoding
3. Output: one or more clean CSV batch files ready for ingestion, saved to `data/batches/`

### When to do this:
- After Row 2 completes (so the ingestion script and batch template exist)
- Before Row 3 (so Row 3 ingests real data, not just seed data)

---

## ROW 3 — Load Real Data (send A only)

### Agent A

```
Load real data into Supabase and validate everything.

Task:
1. Run the ingestion script with the prepared batch files in `data/batches/` to load real listing data into Supabase through the full write pipeline. If no real batch files exist yet, fall back to the 10 seed listings (convert from supabase/seed.sql to CSV first) to test the pipeline.
2. Run the distance precomputation script to populate faculty_distances for all ingested listings × all faculties.
3. Validate:
   - Every listing has all dimensions filled (no nulls in any required column)
   - Every listing has distance data for every faculty in the faculties table
   - All listing_id values follow the LLLLNNN format (7 digits, no hyphen)
   - All lat/lng values are within Thessaloniki bounds
   - All prices are in EUR and within reasonable range (100-1000)
4. Output a validation report to `docs/data-validation-report.md` listing what passed and what failed.
5. Fix any issues found and re-run until the validation is clean.
6. Export a full data snapshot to `data/seed-snapshot.json` as backup.

Work ONLY in `scripts/`, `data/`, and `docs/`. Do not touch `src/`.
```

### Agent B

_(idle — waiting for A)_

### Agent C

_(idle — waiting for B)_

---

## ROW 4 — API Validation + Data Documentation (send A + B together)

### Agent A

```
Write documentation and maintenance tooling for the data layer.

Task:
1. Write `docs/ingestion-guide.md`: step-by-step instructions for preparing a new CSV batch, running ingest.py, and running compute_distances.py. Include: the expected CSV format with every column explained, required vs optional fields, common data cleaning tips (Greek character encoding, price format, coordinate validation), example commands.
2. Create `scripts/validate_data.py` — a standalone validation script that connects to Supabase and checks: no null dimensions on any listing, all distances computed for every listing×faculty pair, all listing_ids follow LLLLNNN format (7 digits, no hyphen), no orphaned records (e.g. listing_amenities referencing a deleted listing). Prints a pass/fail summary.
3. Review all Python scripts (ingest.py, compute_distances.py, validate_data.py) for error handling. Add clear error messages for: missing CSV columns, invalid coordinates, Supabase connection failures, OSRM API timeouts.

Work ONLY in `scripts/` and `docs/`.
```

### Agent B

```
Test the API endpoints against the real data now loaded in Supabase.

Task:
1. Test every endpoint with real queries:
   - GET /api/listings?max_budget=400&types=studio&faculty=auth-engineering — verify only studios under 400 EUR are returned with AUTH Engineering distances
   - GET /api/listings?exclude_amenities=ground_floor,no_ac — verify listings with ground floor OR no AC are excluded
   - GET /api/listings?sort_by=price&sort_order=asc — verify price sorting
   - GET /api/listings?sort_by=walk_minutes&sort_order=asc&faculty=uom-economics — verify distance sorting
   - GET /api/listings (no params) — verify all listings returned with default sort
   - GET /api/listings/[known-seed-id] — verify full detail with all dimensions, all faculty distances, all amenities
   - GET /api/listings/9999-99 — verify 404 response
   - GET /api/faculties — verify all faculties returned
2. Document any edge cases, unexpected behaviors, or bugs found in `docs/api-edge-cases.md`.
3. Fix any bugs discovered.

Work ONLY in `src/app/api/`, `src/lib/`, and `docs/`.
```

### Agent C

_(idle — waiting for B)_

---

## ROW 5 — Frontend Integration + API Polish (send B + C together)

### Agent A

_(done)_

### Agent B

```
Polish and optimize the API layer.

Task:
1. Add basic request validation to all API routes — reject malformed params early with descriptive 400 errors.
2. Ensure Supabase indexes exist on: monthly_price, property_type, listing_id, and the faculty_id foreign key in faculty_distances. Create a migration file if needed.
3. Add Cache-Control headers to GET /api/faculties (cache for 24h — this data rarely changes) and GET /api/listings (cache for 5 min with stale-while-revalidate).
4. Test: run 50 sequential requests to GET /api/listings and measure average response time. Document results in `docs/api-performance.md`.

Work ONLY in `src/app/api/`, `src/lib/`, `supabase/migrations/`, and `docs/`.
```

### Agent C

```
Connect the frontend to the live API and verify the full user flow.

Task:
1. Connect all frontend pages to the real API — remove any remaining hardcoded or placeholder data:
   - Quiz page: fetch faculties from GET /api/faculties to populate the dropdown (replace hardcoded options)
   - Results page: call GET /api/listings with quiz params from URL search params
   - Detail page: call GET /api/listings/[id] for real listing data
2. Test the full flow end-to-end:
   - Take the quiz with various selections → results page shows correct filtered listings
   - Sort by price, walk time, transit time — verify order changes
   - Click a listing → detail page shows all real data: photos, price, amenities, distances, description
   - Go back to results → state is preserved
   - Submit quiz with very restrictive filters → empty state appears correctly
3. Responsive check: verify layout at 375px (mobile), 768px (tablet), 1280px (desktop). Fix any overflow, wrapping, or spacing issues.
4. Run `npm run build` — must complete with zero errors and zero warnings. Fix anything that fails.

Work ONLY in `src/app/` (except `src/app/api/`), `src/components/`, and `public/`.
```

---

## ROW 6 — Final Frontend Polish (send C only)

### Agent A

_(done)_

### Agent B

_(done)_

### Agent C

```
Final polish pass on the frontend.

Task:
1. Accessibility: color contrast meets WCAG AA on all text elements, all images have descriptive alt text, quiz form is fully keyboard-navigable (tab through all fields, enter to submit), focus states are clearly visible on all interactive elements.
2. Loading states: skeleton loaders on the results page (show 6 placeholder cards while loading) and detail page (show placeholder blocks for image, text, and table).
3. SEO: proper <title> on every page ("ThessHousing — Find Student Housing in Thessaloniki", "Available Listings — ThessHousing", etc.). <meta name="description"> with relevant copy. Open Graph tags (og:title, og:description, og:image) on the homepage at minimum.
4. Error states: if an API call fails, show a friendly error message ("Something went wrong. Please try again.") instead of a blank page or crash.
5. Final responsive verification at 375px, 768px, 1280px.
6. Run `npm run build` one final time — zero errors, zero warnings.

Work ONLY in `src/app/` (except `src/app/api/`), `src/components/`, and `public/`.
```
