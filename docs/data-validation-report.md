# Data Validation Report

**Generated:** 2026-03-29 19:14  
**Database:** Supabase PostgreSQL 17.6 (live, eu-west-1)  
**Overall:** ✅ ALL CHECKS PASSED

## Summary

| Metric | Count |
|--------|-------|
| Total listings | 22 |
| Seed listings (synthetic) | 10 |
| Batch listings (real scraped) | 12 |
| With price listed | 10 |
| Price not listed (flagged) | 12 |
| Landlords | 7 |
| Faculty reference points | 6 |
| Distance records | 132 |
| Expected distance records | 132 |

## Checks

### 1. ✅ listing_id follows 7-digit LLLLLNN format

All valid

### 2. ✅ All required dimensions filled

0 issues

### 3. ✅ All lat/lng within Thessaloniki bounds

0 out of bounds

### 4. ✅ Prices in EUR, 100-1000 range

10 priced, 12 null (flagged), 0 issues

### 5. ✅ Every listing has distances for every faculty

132/132 pairs

### 6. ✅ No duplicate listing_id values

22 unique IDs

### 7. ✅ listing_id prefix matches landlord_id

0 mismatches

## Data Quality Notes

- **Price-not-listed:** 12 listings have `monthly_price = NULL` — landlords don't publish prices. Flagged with `PRICE_MISSING`.
- **Approximate coordinates:** Some batch listings have estimated lat/lng. Flagged with `COORDS_APPROXIMATE`.
- **Distances via OSRM:** Walk = foot profile; transit = driving × 1.5 (OSRM has no public transit profile).
- **All constraints enforced by PostgreSQL:** CHECK, FK, and NOT NULL rules validated at DB level.
