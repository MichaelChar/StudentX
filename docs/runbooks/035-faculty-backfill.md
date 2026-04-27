# Runbook — Migration 035: AUTH faculty backfill + landmark reference points

**Migration:** [`supabase/migrations/035_seed_remaining_auth_faculties_and_landmarks.sql`](../../supabase/migrations/035_seed_remaining_auth_faculties_and_landmarks.sql)

## What this migration adds

Source-control drift fix plus two new dedicated landmark rows for the listing detail page distance table. Every insert is `ON CONFLICT (faculty_id) DO NOTHING`, so this is safe to re-run.

| `faculty_id` | `name` | Coords (lat, lng) | New on prod? |
|---|---|---|---|
| `auth-economics` | Faculty of Social & Economic Sciences | 40.6301, 22.9563 | No (already in prod) |
| `auth-education` | Faculty of Education | 40.6301, 22.9563 | No |
| `auth-engineering` | Faculty of Engineering | 40.6310, 22.9590 | No |
| `auth-fine-arts` | Faculty of Fine Arts | 40.5584, 23.0093 | No |
| `auth-law` | Faculty of Law | 40.6301, 22.9563 | No |
| `auth-pe` | Faculty of Physical Education & Sport Sci | 40.5584, 23.0093 | No |
| `auth-philosophy` | Faculty of Philosophy | 40.6301, 22.9563 | No |
| `auth-sciences` | Faculty of Sciences | 40.6301, 22.9563 | No |
| `auth-theology` | Faculty of Theology | 40.6301, 22.9563 | No |
| `auth-library` | AUTH Central Library | 40.6299, 22.9590 | **Yes** |
| `ahepa-hospital` | AHEPA University Hospital | 40.6258, 22.9555 | **Yes** |

The 9 AUTH-faculty rows already exist in production; the migration is a strict no-op for them. Only the 2 landmarks insert net-new rows. On a fresh dev clone (or any partial env) every missing row inserts.

`auth-medical` is **not** touched by this migration. It already exists in production with the name `Faculty of Health Sciences` (per the H4 fuzzy-name fix). Renaming or re-inserting it is out of scope.

`auth-main` (in `002_seed_faculties.sql` but not in production) is also left alone — it's a working local fixture; removing it would only diverge dev tooling without prod benefit.

## How to apply

The parent agent applies the migration to production via Supabase MCP `apply_migration` after the PR merges. No manual psql/CLI step required.

```
mcp__supabase__apply_migration
  name: "035_seed_remaining_auth_faculties_and_landmarks"
  query: <contents of supabase/migrations/035_seed_remaining_auth_faculties_and_landmarks.sql>
```

CI's `migration-check.yml` runs `supabase start` on the PR, which applies all migrations 001 → 035 against a clean local stack. A green check means 035 is valid SQL and idempotent against the local seed.

## Populating `faculty_distances` for the new landmarks

Adding faculty rows does not auto-create distance rows. After the migration applies, run the precomputation script with `--only-missing`. It will fetch every existing listing and every faculty (including the 2 new landmarks), compute walk/transit minutes for each pair via OSRM, and insert the missing rows. Existing pairs are skipped.

```bash
export SUPABASE_URL="https://YOUR-REF.supabase.co"
export SUPABASE_KEY="<service-role-key>"

python3 scripts/compute_distances.py --only-missing
```

The script is rate-limited (~1 OSRM request/second). With N listings in production, it makes 2 × N OSRM calls for the new landmark pairs. At ~50 listings that's ~100 calls → roughly 2 minutes wall time. Output prints per-pair walk/transit minutes; failures are logged and can be retried by re-running the same command.

Once distances exist for both new landmark ids on every listing, the listing detail page distance table can be updated to show three honest rows (Library, AHEPA Hospital, plus the listing's nearest AUTH faculty) instead of the current proxy-via-`auth-main`/`auth-medical` hack. That UI change is a follow-up — out of scope for this migration.

## Verification

After `apply_migration` succeeds, run these in Supabase MCP `execute_sql` (or psql):

```sql
-- Expect: 13 (11 pre-existing AUTH + auth-library + ahepa-hospital)
SELECT COUNT(*) FROM faculties WHERE university = 'AUTH';

-- Expect: rows present for both new landmarks
SELECT faculty_id, name, lat, lng
  FROM faculties
 WHERE faculty_id IN ('auth-library', 'ahepa-hospital');
```

After `compute_distances.py --only-missing` finishes:

```sql
-- Expect: count equals number of listings (1 row per listing per new landmark)
SELECT faculty_id, COUNT(*) AS listings_with_distance
  FROM faculty_distances
 WHERE faculty_id IN ('auth-library', 'ahepa-hospital')
 GROUP BY faculty_id;
```

If a row count is short, re-run `python3 scripts/compute_distances.py --only-missing` to retry the failures. OSRM occasionally returns transient errors that resolve on retry.

## Rollback

To remove the 2 landmarks (the only inserts that actually change production):

```sql
DELETE FROM faculty_distances WHERE faculty_id IN ('auth-library', 'ahepa-hospital');
DELETE FROM faculties         WHERE faculty_id IN ('auth-library', 'ahepa-hospital');
```

`faculty_distances` rows must be deleted first — `faculties.faculty_id` is referenced by `faculty_distances.faculty_id` with `ON DELETE CASCADE`, so a single `DELETE FROM faculties` would also work, but doing distances first makes the impact explicit.

The 9 AUTH backfill rows already existed pre-035, so they have no rollback — leave them alone.

## Notes

- The migration's coordinates for the 9 backfilled AUTH rows match production exactly. They look heavily duplicated (many rows share `40.6301, 22.9563` for the main quadrangle and `40.5584, 23.0093` for the Thermi-area satellite faculties), but that is the live data, not a typo.
- The two landmark coordinates were chosen to match the real geographic features: AUTH Central Library on the main campus quadrangle, AHEPA University Hospital adjacent to the medical campus on Stilponos Kyriakidi.
