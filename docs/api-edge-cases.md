# API Edge Cases & Testing Notes

Tested against live Supabase data (22 listings, 6 faculties).

---

## Bugs Found & Fixed

### 1. Listing ID validation too strict
- **Route:** `GET /api/listings/[id]`
- **Issue:** Regex validated `^\d{4}-\d{2}$` (e.g. `0001-01`), but real data uses IDs without dashes (e.g. `0001001`).
- **Fix:** Relaxed validation to accept any string starting with a digit, containing digits and optional dashes: `/^\d[\d-]+$/`.

### 2. Null-price listings sorted incorrectly in descending order
- **Route:** `GET /api/listings?sort_by=price&sort_order=desc`
- **Issue:** Listings with `monthly_price: null` were treated as `Infinity`, which sorted them to the **top** in descending order.
- **Fix:** Null values are now always pushed to the end of results regardless of sort direction.

---

## Data Observations

### Listings with null prices
12 of 22 listings have `monthly_price: null` (all from landlords `0100` and `0101`). These are real listings ingested from external sources where pricing wasn't available. The `rent!inner` join doesn't filter them out because the rent record exists — the `monthly_price` column simply contains `NULL`.

**Impact:** These listings appear in unfiltered results but are excluded by any `max_budget` filter (since `NULL <= budget` is false in PostgreSQL).

### Property type names are full strings
The `types` filter matches against `property_types.name`, which uses full descriptive names like `"Room in shared apartment"`, `"2-Bedroom (x2)"`, not short codes. Clients must pass exact names (case-sensitive): `?types=Studio,1-Bedroom`.

### Faculty IDs vs original mock IDs
Real faculty IDs differ from the original mock data:
- `auth-main` (not `auth-engineering`)
- `auth-medical` (not `auth-medicine`)
- `auth-agriculture` (new)
- `uom-main` (not `uom-economics`)
- `ihu-thermi` (not `ihu-technology`)
- `ihu-sindos` (new)

Clients should fetch `GET /api/faculties` to get current IDs rather than hardcoding them.

---

## Test Results Summary

| Test | Endpoint | Result |
|------|----------|--------|
| All listings (no params) | `GET /api/listings` | 22 listings returned, sorted by price asc (nulls last) |
| Budget + type + faculty filter | `GET /api/listings?max_budget=400&types=Studio&faculty=auth-main` | 3 studios ≤€400 returned with only AUTH Main distances |
| Exclude amenities (dealbreakers) | `GET /api/listings?exclude_amenities=AC,Elevator` | 5 listings returned, all have both AC and Elevator |
| Price sort ascending | `GET /api/listings?sort_by=price&sort_order=asc` | Correct: €200 → €520 → nulls |
| Price sort descending | `GET /api/listings?sort_by=price&sort_order=desc` | Correct: €520 → €200 → nulls |
| Walk time sort with faculty | `GET /api/listings?sort_by=walk_minutes&sort_order=asc&faculty=uom-main` | Correct: 3min → 8min sorted |
| Listing detail (valid ID) | `GET /api/listings/0001001` | Full detail with 6 faculty distances, 4 amenities, landlord info |
| Listing detail (not found) | `GET /api/listings/9999-99` | 404: `{ "error": "Listing not found" }` |
| Invalid sort_by | `GET /api/listings?sort_by=invalid` | 400: descriptive error |
| Invalid max_budget | `GET /api/listings?max_budget=abc` | 400: descriptive error |
| Very low budget (empty result) | `GET /api/listings?max_budget=1` | 200: `{ "listings": [] }` |
| All faculties | `GET /api/faculties` | 6 faculties returned, ordered by university then name |

---

## Potential Future Improvements

- **Pagination:** Currently returns all matching listings. Will need `limit`/`offset` or cursor-based pagination as data grows.
- **Case-insensitive type filter:** `types` param requires exact case match against `property_types.name`. Consider normalizing.
- **Null price handling:** Consider excluding listings with null prices from results by default, or adding an `include_unpriced=true` opt-in param.
