# Spec: Student Resources hub at `/resources`

## Goal

Replace the `/student` services hub (image-only squares + intro video) with a **Student Resources** hub at **`/resources`**: a scrollable list of resource cards, each with a title + description, filterable by facets. Optimize for a brand-new user orienting themselves.

Planned in a prior session; all decisions below are final — do not re-litigate them, just implement.

## Locked decisions

- New route: top-level **`/resources`** (i.e. `src/app/[locale]/resources/page.js`). Replaces the `/student` hub page **entirely** (squares + intro video are gone).
- Facets: **Resource type**, **Semester**, **Country** — where *country* means **the country of the medical curriculum** the resource follows (e.g. AUSoM is a Greek-curriculum school in Greece and may share resources with other Greek med schools). It is NOT the school's location per se.
- A facet is **only rendered when it has ≥2 distinct values** in the live data. Today only Resource type qualifies (all content is AUSoM / semester-2 / Greek curriculum); semester + country appear automatically once content varies. Build all three into the data model now.
- Filters are a **compact horizontal chip row** above the card list — NOT a half-screen filter panel. Resources must be visible above the fold on mobile.
- Each chip shows a **count** ("Practice tests · 12"). Filtering happens **client-side** over the bundled manifest.
- Filter state lives in the **URL query string** (`/resources?type=practice-test&semester=2`) via `useSearchParams` — shareable/deep-linkable, back-button works.
- **Never render an empty result set**: if the active combination matches nothing, show a "no exact matches" line followed by the nearest relaxation (e.g. drop the last-applied filter) so the page never dead-ends.
- Data stays in **build-time JSON manifests** (existing pattern) — no Supabase, no runtime fs (Cloudflare Workers constraint).

## Current state (read these first)

- Hub page to replace: `src/app/[locale]/student/page.js` (SQUARES grid → `/student/ausom`, `/student/flashcards`).
- Home page tile linking to it: `src/app/[locale]/page.js` (~line 12, `href: '/student'`).
- Existing per-resource metadata: `content/practice/ausom/semester-2/<subject>/index.json` (has `subject`, `title`, `school`, `semester`, `tests[]`) and `content/flashcards/<subject>/index.json` (has `subject`, `title`, `decks[]` with `description`, `cardCount`).
- Existing manifest pattern to clone: `scripts/generate-practice-manifest.mjs` → `src/lib/practice/manifest.generated.js`, and the flashcards twin. Static imports only — required for OpenNext/Workers.
- Redirects live in `next.config.mjs#redirects()`; cache headers in the same file's `headers()`.

## Work items

### 1. Data model

- `src/lib/resources/taxonomy.js` — single source of truth for controlled vocabularies with labels:
  - `RESOURCE_TYPES`: `practice-test`, `flashcard-deck` (add `study-notes` to the enum now; unused is fine). `past-paper` was removed from the enum — past papers are not a supported resource type on this hub (copyright/liability; see resource-extraction skill).
  - `SEMESTERS`: `semester-1` … (label "Semester 1" …).
  - `COUNTRIES`: `gr` → "Greek curriculum" (extendable).
- Extend each `content/**/index.json` with the facet fields it's missing: `type`, `semester`, `school`, `country`. Flashcards index needs `semester` + `country` + `school`; practice indexes need `country`. Per-item entries (each test / each deck) become one resource card each.
- `scripts/generate-resources-manifest.mjs` (+ `npm run resources:manifest`): walks `content/practice/**/index.json` and `content/flashcards/**/index.json`, emits `src/lib/resources/manifest.generated.js` exporting a flat array:

  ```js
  {
    id: 'practice:biochemistry:mega-test',
    type: 'practice-test',            // validated against RESOURCE_TYPES
    title: 'MD1011 Biochemistry I — Mega Test',
    description: '48-question mega test covering …',
    href: '/student/ausom/semester-2/biochemistry/mega-test',
    school: 'ausom',
    semester: 'semester-2',           // validated against SEMESTERS
    country: 'gr',                    // validated against COUNTRIES
    meta: { questionCount: 48 },      // type-specific extras for the card footer
  }
  ```

- Generator **fails loudly** (non-zero exit) when a facet value isn't in the taxonomy or a required field is missing — validation at build time, same philosophy as the practice validator (PR #311). Every test/deck entry already has a founder-written `description` in its index.json — use it verbatim on the card; do NOT rewrite this copy.

### 2. Routes & redirects

- New `src/app/[locale]/resources/page.js` — server component: `setRequestLocale`, metadata title "Student Resources — StudentX", renders header + `<ResourcesExplorer />`.
- `src/components/ResourcesExplorer.js` — the one `'use client'` component: reads manifest array (static import), derives facets (hide any with <2 distinct values), chip row with counts, filtered card list, URL-synced state, no-empty-results fallback.
- Remove the hub route file `src/app/[locale]/student/page.js` and add redirect `{ source: '/student', destination: '/resources', permanent: true }` in `next.config.mjs#redirects()`. **Exact path only** — `/student/login`, `/student/ausom/**`, `/student/flashcards/**` etc. must keep working unchanged.
- Update home tile in `src/app/[locale]/page.js`: `href: '/resources'`, label → "Student Resources" (update the message key in `src/messages/en.json`; missing keys trip the `missing-message` synthetic canary).
- Add `/resources` to `src/app/sitemap.js`.
- **Caching note:** do NOT add `/resources` to the private-cache rules. `/student/:path*` is pinned `private, no-cache` in `next.config.mjs#headers()`; top-level `/resources` correctly falls under the public-cacheable catch-all — that's a deliberate perf win of the move. Leave the `/student/:path*` private rule intact for the remaining auth pages.
- Resource destinations (`/student/ausom/...`, `/student/flashcards/...`) **stay at their current URLs** — out of scope to move them.

### 3. Cards

- Card = title, description, type badge, small meta line (question count / card count), whole card is the link (`next/link`). Reuse the existing hover/shadow treatment from the old hub squares for visual continuity; Tailwind v4 tokens (`night`, `parchment`, `blue`) per CLAUDE.md.
- The old `/services/*.jpg` square images and `hub-intro.mp4` video are no longer referenced; leave the assets in place, just drop the references.

### 4. Tests (`__tests__/lib/`)

- Taxonomy validation: generator rejects unknown `type` / `semester` / `country`.
- Manifest shape: every entry has id/type/title/description/href.
- Facet derivation: facet with 1 distinct value is hidden; counts are correct.
- Filter logic: combined facets AND together; empty-result fallback path returns relaxed set.

## Acceptance criteria

- [ ] `/resources` renders all resource cards with descriptions; `/student` 301s to it; `/student/login`, `/student/ausom/semester-2`, `/student/flashcards` still resolve.
- [ ] Only facets with ≥2 values render (today: Resource type only).
- [ ] Chip counts correct; filter state round-trips through the URL; back button restores prior filter state.
- [ ] No filter combination produces a blank list.
- [ ] Home page tile points at `/resources` with updated label; no `MISSING_MESSAGE` on `/`.
- [ ] `npm run resources:manifest` regenerates deterministically; committing a bad facet value fails the script.
- [ ] `npm run lint && npm run test && npm run build` green.

## Process

- Branch + PR to `main` (direct pushes are policy-blocked). No Supabase migration involved.
- Mobile-first check: at 375px width the first resource card must be visible without scrolling past the filter row.
