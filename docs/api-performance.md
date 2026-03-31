# API Performance Benchmarks

Measured 2026-03-30 against live Supabase (22 listings, 6 faculties).
Environment: Next.js 16.2.1 dev server, 50 sequential `curl` requests per endpoint.

---

## Results

| Endpoint | Params | Min | Max | Avg | StdDev |
|----------|--------|-----|-----|-----|--------|
| `GET /api/listings` | *(none — all 22 listings)* | 149ms | 733ms | 263ms | 116ms |
| `GET /api/listings` | `max_budget=400&faculty=auth-main` | 144ms | 519ms | 283ms | — |
| `GET /api/listings/0001001` | *(single listing detail)* | 122ms | 530ms | 223ms | — |
| `GET /api/faculties` | *(all 6 faculties)* | 129ms | 650ms | 254ms | — |

## Analysis

- **Steady-state latency** is ~150-250ms, dominated by the Supabase round-trip (remote PostgreSQL). The first request is typically 500-700ms due to Next.js route compilation in dev mode.
- **Filtered queries** perform similarly to unfiltered ones at this data size — the index on `rent.monthly_price` and `listings.property_type_id` will matter more as data grows.
- **Detail endpoint** is slightly faster because `.single()` returns one row with no client-side sorting.

## Caching Strategy

| Route | `Cache-Control` | Rationale |
|-------|-----------------|-----------|
| `GET /api/faculties` | `s-maxage=86400, stale-while-revalidate=3600` | Faculty data changes rarely (new campus additions). 24h cache with 1h SWR. |
| `GET /api/listings` | `s-maxage=300, stale-while-revalidate=600` | Listings change moderately (new listings, price updates). 5min cache with 10min SWR. |
| `GET /api/listings/[id]` | `s-maxage=300, stale-while-revalidate=600` | Same as listings index. |

## Indexes in Use

All required indexes already exist in `001_create_schema.sql`:

| Index | Column(s) | Used By |
|-------|-----------|---------|
| `idx_rent_monthly_price` | `rent(monthly_price)` | `max_budget` filter |
| `idx_listings_property_type_id` | `listings(property_type_id)` | `types` filter (via FK join) |
| `listings_pkey` | `listings(listing_id)` | Detail route `.eq("listing_id", id)` |
| `idx_faculty_distances_faculty_id` | `faculty_distances(faculty_id)` | `faculty` filter |
| `idx_listing_amenities_amenity_id` | `listing_amenities(amenity_id)` | Amenity joins |

No additional migration needed — all four requested indexes were already created.

## Future Optimization Opportunities

1. **Pagination** — Add `limit`/`offset` or cursor-based pagination to cap result size as listings grow.
2. **Supabase connection pooling** — The singleton client reuses its connection, but Supabase's pgBouncer layer handles pooling on the server side.
3. **Edge caching** — When deployed to Vercel, the `s-maxage` headers will automatically activate CDN edge caching, eliminating Supabase round-trips for cached responses.
4. **RPC for complex filters** — If `exclude_amenities` (currently post-query filtered in JS) becomes a bottleneck, move it to a Postgres function for server-side exclusion.
