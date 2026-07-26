# University distance on listings — scope

**Status:** proposed, not built.
**Goal:** every listing shows how far it is (in metres) from the city's
universities, readable at a glance from the `/property/thessaloniki/results`
card grid without opening the listing.

---

## Decisions taken

| Question | Decision |
|---|---|
| Unit | **Metres**, formatted `450 m` / `1.2 km` |
| Granularity | **University**, not faculty — AUTH, UoM, IHU |
| Who supplies it | **The landlord**, in the listing form: pick a university from a dropdown, type the metres |
| Dropdown contents | **Scoped to the listing's city.** Thessaloniki → AUTH, UoM, IHU |
| Prefill / auto-compute | **No.** The landlord types the number. No haversine prefill, no computed cross-check, no drift report. If a landlord gets it wrong, that's on the landlord. |
| Where shown | Listing card (results + favourites + hub carousel), and the listing detail page |

Because the number is entirely landlord-supplied, the card copy should not
imply StudentX measured it — it's a listing attribute like `sqm`, not a
platform-computed fact. See *Card display*.

---

## What already exists (and why it isn't this)

The repo already has a *faculty*-level commute dataset:

- `faculties` — 13 rows in prod, **all AUTH** (`ahepa-hospital`, `auth-law`,
  `auth-sciences`, …). No UoM, no IHU. `docs/schema.md` is stale here: it still
  documents `uom-main`, `ihu-thermi`, `ihu-sindos`, which do not exist in prod.
- `faculty_distances` — precomputed `walk_minutes` / `transit_minutes` per
  listing × faculty, populated by `scripts/compute_distances.py` and healed
  nightly by `/api/cron/recompute-distances` (`src/lib/recomputeDistances.js`).
  Coverage in prod is complete: 3 listings × 13 faculties = 39 rows.
- It's already plumbed through `transformListing.js` → `faculty_distances[]`
  on every API response, and `/api/listings` can filter and sort on it
  (`?faculty=auth-law&sort_by=walk_minutes`).

**None of it is rendered anywhere a student can see**, except one line of
`<meta description>` on the listing detail page
([layout.js:29](src/app/[locale]/property/[city]/listing/[id]/layout.js:29)).
The results page never sends the `faculty` param, and the quiz never asks which
university you attend — so the whole filter/sort capability is dead code today.

This spec **does not touch** `faculties` / `faculty_distances`. They stay as the
computed minutes dataset, untouched and still unused. The landlord-authored
metres live in their own table. Reasons to keep them separate:

- Different granularity (faculty vs university), different unit, different
  provenance (computed vs self-reported).
- `faculty_distances` is RLS-locked against non-service writes by migrations
  050 and 055 — deliberately. Landlord-writable data must not go in there.

---

## Data model

Next migration number is **066** (prod's highest applied is
`065_revoke_anon_landlord_pii_columns`; the repo file tree agrees, but re-check
`list_migrations` before writing — prod has drifted from the repo before).

### `universities` (new dimension)

City-scoped, drives the landlord dropdown.

| Column | Type | Constraints |
|---|---|---|
| `university_id` | TEXT | PK — slug, e.g. `auth`, `uom`, `ihu` |
| `city_slug` | TEXT | NOT NULL — matches `SUPPORTED_CITIES` in `src/lib/cityRoutes.js` |
| `name` | TEXT | NOT NULL — "Aristotle University of Thessaloniki" |
| `short_name` | TEXT | NOT NULL — "AUTH", the card label |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 — dropdown + card ordering |

No `lat`/`lng` — nothing computes against these rows, so coordinates would be
dead weight. (Add them later if phase 2 ever wants a map layer.)

**Index:** `idx_universities_city_slug`.
**RLS:** public read (anon SELECT), no public write. Seed AUTH, UoM, IHU for
`thessaloniki` in the same migration.

### `listing_university_distances` (new fact)

| Column | Type | Constraints |
|---|---|---|
| `listing_id` | TEXT | PK (composite), FK → listings ON DELETE CASCADE |
| `university_id` | TEXT | PK (composite), FK → universities ON DELETE CASCADE |
| `distance_meters` | INTEGER | NOT NULL, CHECK `> 0 AND <= 50000` |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**Index:** `idx_lud_university_id` (for the phase-2 "closest to my university"
sort).
**RLS:** anon SELECT (public listing data); INSERT/UPDATE/DELETE only for the
owning landlord — mirror the ownership predicate the existing `listings`
landlord policies use (migrations 005/006), joining through
`listings.landlord_id`. Do **not** copy the `faculty_distances` policy; that one
denies all non-service writes on purpose.

`supabase/seed.sql` needs the university rows too, or `migration-check.yml`
fails on every PR (CLAUDE.md — migration 038 already caught this once).

**No backfill.** The 3 listings currently in prod get nothing until their
landlord edits them, and cards render nothing in the meantime. Accepted:
you own all 3 today, so filling them in is three form edits.

---

## API surface

### Read

`transformListing.js` gains a sibling to `faculty_distances`:

```js
university_distances: (row.listing_university_distances ?? [])
  .map((ud) => ({
    university_id: ud.university_id,
    short_name: ud.universities?.short_name ?? null,
    name: ud.universities?.name ?? null,
    distance_meters: ud.distance_meters,
  }))
  .sort((a, b) => a.distance_meters - b.distance_meters),
```

Nearest-first sort happens here so every consumer (card, detail page, map
popup) gets the same order for free.

The select string is duplicated in **four** places — keep them in lockstep:
- [src/app/api/listings/route.js:25](src/app/api/listings/route.js:25) and `:40`
- [src/app/api/listings/[id]/route.js](src/app/api/listings/[id]/route.js)
- [src/lib/listingForRender.js:16](src/lib/listingForRender.js:16) and `:32`
- [src/app/api/landlord/listings/route.js](src/app/api/landlord/listings/route.js)

`__tests__/lib/transformListing.test.js` has a shape snapshot that needs the
new key.

### Write

`POST`/`PATCH /api/landlord/listings` accept an optional
`university_distances: [{ university_id, distance_meters }]`.

Server-side validation — sanity bounds only, no correctness judgement:
- `university_id` must exist **and** belong to the listing's city.
- `distance_meters` an integer in `(0, 50000]`.
- At most one row per university.
- Replace-all semantics on save (delete then insert, inside the existing
  listing write path).

Non-fatal on failure, matching how `recomputeDistances` is already swallowed in
the create path — a rejected distance row should never fail listing creation.

---

## Landlord form

[src/components/ListingForm.js](src/components/ListingForm.js) — new section
after the sqm/floor row, before Description.

A repeatable row list, capped at the number of universities in the city (3),
starting empty:

```
DISTANCE TO UNIVERSITY                                    [+ Add university]
┌──────────────────────────────┬──────────────────┬───┐
│ AUTH — Aristotle University ▾│  1200      metres│ ✕ │
└──────────────────────────────┴──────────────────┴───┘
```

- Dropdown lists universities for the listing's city; already-selected ones
  disabled. City comes from the route params (`thessaloniki` today — see
  `DEFAULT_CITY` in `cityRoutes.js`), not hardcoded in the component.
- Number input, `min=1 max=50000 step=10`, inline error only on the bounds.
- Optional field. No rows is a valid listing.
- All copy through `next-intl` (`src/messages/en.json`, `landlord.form.*`) —
  a missing key trips the `missing-message` synthetic canary in prod.

---

## Card display — the actual ask

[src/components/ListingCard.js](src/components/ListingCard.js). Scanning across
a grid works when the element sits at a **fixed vertical position** in every
card, so put it in the body's meta block, not floating in the pill row.

Slot: a new line directly under the neighborhood small-caps line, above the
title — top of the card body, same y-offset on every card whether or not the
title wraps to two lines.

```
ANO POLI · THESSALONIKI
📍 450 m AUTH  ·  1.2 km UoM                ← new
Rennovated private room in 2bedroom wit...
PRIVATE ROOM                        €450/mo
```

- Show the **nearest two**, ascending. Three fits on desktop but overflows the
  narrow card at the `sm` breakpoint; the rest live on the detail page.
- Formatting helper `src/lib/formatDistance.js`: `< 1000` → round to nearest
  50 m, `"450 m"`; `>= 1000` → one decimal km, `"1.2 km"`. Never render false
  precision like `1,247 m` — it implies a measurement nobody took.
- Styling: `label-caps text-night/55`, matching the neighborhood line's weight
  so it reads as metadata, not a third heading competing with the price.
- **Render nothing** when the listing has no rows — no "distance not listed"
  placeholder. With no backfill, empty will be the common case at launch, and
  an empty slot is quieter than a negative one.
- One `Icon` pin glyph at the start of the line, not one per university.

Detail page: full list, all universities the landlord filled, under the address
block, same formatter. Because the value is self-reported, label the section
neutrally — `Distance to universities` with a `Listed by the landlord` caption
— rather than anything implying StudentX measured it.

---

## Phasing

**Phase 1 — the ask, end to end.** Migration 066 (both tables + seed + RLS),
`seed.sql`, `transformListing` + the 4 select strings, landlord form section,
write validation, `formatDistance.js`, card line, detail-page list, en.json
keys, tests. Apply the migration to prod *before* merging (CLAUDE.md —
Cloudflare deploys on push-to-main and the new select strings will 500 in the
gap between deploy and migration).

**Phase 2 — make it filterable.** `?university=auth&max_distance=1500` on
`/api/listings` via `parseListingFilters`, a university chip filter in the
results panel, a "Closest to my university" sort. This is where the feature
earns its keep — a static number on a card is nice, "within 1 km of UoM" is a
reason to use the site. Also the natural moment to add "where do you study?" to
the quiz, which currently asks only budget / type / dealbreakers. Note the
filter only sees listings whose landlord filled the field, so it needs decent
fill-in before it's worth shipping.

---

## Follow-ups this surfaced (not in scope)

- `docs/schema.md` is wrong about `faculties` — documents 6 reference points
  including UoM and IHU; prod has 13, all AUTH.
- `auth-fine-arts` and `auth-pe` have coordinates producing 130–145 min walk
  times where every sibling faculty is 18–21 min. Looks like bad lat/lng.
- The `faculty` filter and `sort_by=walk_minutes` in `/api/listings` are
  reachable but referenced by no UI — wire them up in phase 2 or delete them.
