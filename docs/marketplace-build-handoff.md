# Marketplace Build — Agent Handoff

Companion to `accommodation-marketplace-spec.md`. Every task below assumes the
agent has **read the spec first** — each prompt says so.

---

## 0. Rules that prevent sessions colliding

Collisions have happened before. These rules are what stop them.

### The three collision magnets

| File | Why it collides | Rule |
|---|---|---|
| **`src/messages/en.json`** | Every UI task adds copy keys. Two agents editing it = guaranteed conflict, and a lost key fires the `missing-message` synthetic canary in prod. | **Only ONE task per wave may edit `en.json`.** Every other task in that wave must add its keys to `docs/pending-i18n-keys.md` (append-only) for the owner to merge. |
| **`supabase/migrations/`** | Two agents pick the same `NNN` prefix → `duplicate key … schema_migrations_pkey` on the clean-stack apply. | **Only ONE migration task exists per wave, and it runs alone.** Number off prod's highest *applied* migration, not the repo's highest file. |
| **`src/lib/transformListing.js`** + `/api/listings*` | The listing shape is the spine; several tasks want to add fields. | One owner per wave. Others consume the shape, never edit it. |

### Standing rules for every session

1. **One git branch per task**, named in the prompt. Never work on `main`.
   Never on `feat/admissions-landing` (unrelated work in flight).
2. **Declare file ownership.** Each prompt lists `OWNS` (may edit) and
   `READ-ONLY` (may read, must not edit). If the task needs a file outside
   `OWNS`, it must stop and report, not edit.
3. **No agent runs `npm run dev`** — a dev server is already up on :3000.
4. **Run `npm run lint && npm run test` before declaring done.**
5. Repo conventions are in `CLAUDE.md` — JS not TS, server components by
   default, next-intl for all copy, `@/` alias, Tailwind tokens
   (`night`/`blue`/`parchment`/`yellow`).

---

## 0.5 DESIGN CONTRACT — paste verbatim into every UI task

Grok drifts off the StudentX design system. Do not rely on "match the existing
style"; paste this block into **T5, T6, T7, T9** and any future UI prompt.

> **DESIGN CONTRACT — non-negotiable. Violating any line is a failed task.**
>
> **Before writing a single component, READ these three files and match their
> structure, spacing and class idiom exactly:**
> - `src/app/[locale]/property/[city]/listing/[id]/page.js` (student surface)
> - `src/app/[locale]/property/[city]/landlord/dashboard/page.js` (landlord surface)
> - `src/components/ui/Card.js` + `src/components/ui/Button.js` (primitives)
>
> **Colour — use ONLY these Tailwind tokens.** Never a raw hex. Never a default
> Tailwind palette class (`gray-*`, `slate-*`, `indigo-*`, `zinc-*` are all
> forbidden):
> `blue` #635BFF (primary/CTA) · `night` #0a2540 (ink, dark surfaces) ·
> `stone` #fff (canvas) · `parchment` #f6f4ff (cards/inputs/surfaces) ·
> `yellow` #ffcb57 and `magenta` #ff5fa2 (accents only) · `iris-soft` #ece7ff.
> Opacity variants of `night` are the house greys: `text-night/60`,
> `border-night/10`. There is no other grey.
>
> **Typography.** Inter throughout. `font-display` for headings, `font-sans` for
> body. Eyebrow labels use the `.label-caps` utility (uppercase, 0.18em
> tracking, 0.7rem, 600) — do not re-implement it inline. Page headers are:
> `<p className="label-caps text-yellow">EYEBROW</p>` then
> `<h1 className="font-display text-3xl md:text-4xl text-night leading-tight">`.
>
> **Radius.** Use the **role-named geometry tokens**, never a bare Tailwind
> radius: `rounded-card` (20px, listing/search card containers) ·
> `rounded-photo` (12px, images inside a card, gallery tiles) · `rounded-pill`
> (24px, filter chips and status pills) · `rounded-control` (8px, buttons,
> inputs, selects) · `rounded-modal` (32px, modals and sheets).
> `rounded-full` stays correct for avatars and circular icon buttons.
> The role name is the point — it states what the element *is*, so the next
> reader can tell a deliberate choice from a sweep artefact.
> **`rounded-sm` is retired** (parity F4, #396/#400/#401 — zero call sites
> left in `src/`); do not reintroduce it, and do not reach for `rounded-lg` or
> `rounded-xl` instead. `rounded-lg` happens to equal `rounded-control` at
> 8px, which makes it easy to add by accident and invisible in review.
>
> **Reuse the existing primitives. Do NOT create new ones, and do NOT inline
> equivalents.** The full set is whatever is in `src/components/ui/` — list it
> before you start rather than trusting this line. As of parity F10 (#415):
> `Button` (variant, size) · `Card` (tone: parchment|stone|night|white, border) ·
> `Pill` (variant: verified|amenity|info) · `Chip` · `Field` · `Icon` ·
> `IconButton` · `Avatar` · `Divider` · `Skeleton` · `SegmentedControl` ·
> `Counter` · `Carousel` · `BottomSheet` · `Modal` · `Sheet` · `Popover` ·
> `Tooltip` · `ConfirmDialog`.
> If you believe a new primitive is needed, STOP and report instead of adding one.
>
> **`SectionHeader`, `OrnamentRule`, `VerifiedSeal` and `EncryptButton` no longer
> exist** — deleted in #415. Use `Divider` for a section rule,
> `<Button variant="primary">` for auth submits, and
> `<Icon name="shieldCheck" className="… text-yellow" />` for the verified mark.
>
> **Icons.** `<Icon name="…" />` only. Never inline `<svg>`, and never import an
> icon package in a page or component. `src/components/ui/Icon.js` is the single
> wrapper over `lucide-react` (#414) — if the icon you need is missing, add the
> Lucide import and map entry **in that file** rather than reaching for the
> package elsewhere.
>
> **Every landlord page is wrapped in `LandlordShell`.** Every student-facing
> page uses the `mx-auto max-w-7xl px-5 py-10 md:py-14` container.
>
> **All copy goes through next-intl.** No hardcoded user-visible strings, ever —
> a missing key fires a production canary.
>
> **Forbidden outright:** adding any CSS/UI/animation/component library;
> `styled-components`; CSS modules; inline `style={{}}` for anything a token
> covers; dark-mode variants (the app is light-only); emoji as icons.
>
> **Self-check before you finish** — grep your diff and confirm zero matches for:
> `#[0-9a-fA-F]{6}`, `bg-gray-`, `text-gray-`, `text-slate-`, `bg-indigo-`,
> `rounded-sm`, `rounded-lg`, `rounded-xl`, `<svg`. Report the grep output.

### Model choice

I can't verify grok CLI's current model IDs or effort flags from here — check
`grok --help` / your model list and map these classes onto what you actually
have. The classes are what matter:

- **FAST-CODE** — mechanical, well-specified, low ambiguity (grok's fast coding
  model; low/medium effort).
- **REASONING** — cross-file refactors, state machines, anything where a wrong
  call is expensive (grok's strongest reasoning model; high effort).
- **CLAUDE CODE** — flagged per task below where the blast radius is wide or a
  mistake is silent. My judgement, stated per task with a reason.

---

## Wave 1 — Foundation *(3 tasks, all parallel-safe)*

File sets are disjoint. **T1 owns `en.json` this wave.**

### T1 — Delete landlord billing & the paid verification tier
**→ CLAUDE CODE, high effort.** 22 files reference `verified_tier` /
`is_featured` / `is_superlandlord`; 15 reference billing. It touches the public
listing shape and the ranking rules, and a partial removal leaves listings
unrankable or a dead nav item. Wide blast radius, and mistakes here are silent.

> Read `docs/accommodation-marketplace-spec.md` §4 first.
>
> Branch: `feat/remove-landlord-billing`.
>
> Remove landlord subscriptions and the paid verification tier entirely.
> DELETE: `src/app/api/landlord/billing/**`, `src/components/BillingSection.js`,
> the `get-verified` page, the `billing` nav entry in
> `src/components/landlord/LandlordShell.js`, the subscription branch of
> `src/app/api/webhooks/stripe/route.js`, and the `subscription_plans` reads.
> Strip `verified_tier` / `is_featured` / `is_superlandlord` from
> `src/lib/transformListing.js` and every consumer, including the SuperLandlord
> pill and golden halo.
>
> KEEP: `verification_requests`, the ID upload flow, and admin approval — now
> free. Keep `src/lib/stripe.js` itself; a later task reuses it for bookings.
>
> Replace the ranking that SuperLandlord priority provided with:
> verified → listing completeness → landlord response time
> (`/api/landlord/response-time` already computes the last one).
>
> Remove the tier-gated photo cap in `src/components/ListingForm.js`; make it a
> uniform cap of 20 for everyone.
>
> Do NOT write a migration — a later task handles schema. Leave the DB columns
> in place and simply stop reading them.
>
> OWNS: everything above, plus `src/messages/en.json`.
> READ-ONLY: `src/app/[locale]/property/[city]/results/**`, `supabase/**`.
>
> Run `npm run lint && npm run test`. Report every file touched.

### T2 — Cron consolidation: single master tick
**→ CLAUDE CODE, high effort.** Failure mode is *silent* (a trigger that never
fires, which already cost 3 days per PR #150), the 25s scheduled-handler budget
is easy to blow, and it touches prod scheduling.

> Read `docs/accommodation-marketplace-spec.md` §W9 and
> `docs/runbooks/cron-schedule-sync.md` first.
>
> Branch: `feat/cron-master-tick`.
>
> Collapse the four cron triggers into ONE `*/5 * * * *` trigger driving
> `/api/cron/tick`, which holds a job registry where each job declares its own
> cadence and the route runs whatever is due against the wall clock.
> Migrate all four existing jobs, and MERGE the landlord and student message
> digests into one job (same work, two audiences — drop the 2-minute offset).
> Jobs run via `Promise.allSettled` with per-job timeouts inside the existing
> 25s `AbortSignal.timeout`; keep `ctx.waitUntil()`. Log per-job outcome so a
> silent failure is visible.
>
> Update `wrangler.jsonc` `triggers.crons`, `cf/worker-entry.mjs` `CRON_ROUTES`,
> the runbook, and the CLAUDE.md cron table. Preserve `CRON_SECRET` auth on
> every path. Do NOT deploy or touch the live CF schedule — leave the manual
> sync step documented for a human.
>
> OWNS: `src/app/api/cron/**`, `cf/worker-entry.mjs`, `wrangler.jsonc`,
> `docs/runbooks/cron-schedule-sync.md`, the cron section of `CLAUDE.md`.
> READ-ONLY: everything else. Add copy keys to `docs/pending-i18n-keys.md`, NOT
> to `en.json` (T1 owns it this wave).
>
> Run `npm run lint && npm run test`.

### T3 — Remove the dead URL importer
**→ FAST-CODE, low effort.** Small, well-bounded deletion.

> Read `docs/accommodation-marketplace-spec.md` §3 "The URL importer is dead".
>
> Branch: `chore/remove-dead-url-importer`.
>
> Both sources are verified dead: spiti.gr no longer exists (parked page, cert
> expired 2023) and xe.gr serves an anti-bot interstitial to all programmatic
> requests. Remove the import UI from `src/components/ListingForm.js` and delete
> `src/app/api/landlord/listings/import-url/route.js` and `src/lib/importers/`.
> Do not attempt to make either source work.
>
> OWNS: the files above.
> READ-ONLY: everything else. Copy keys to remove go in
> `docs/pending-i18n-keys.md` for T1's owner to delete from `en.json`.
>
> Run `npm run lint && npm run test`.

**Wave 1 gate:** merge T1 → T2 → T3 in that order, running `npm run build`
between each.

---

## Wave 2 — Schema *(1 task, runs ALONE)*

### T4 — Marketplace schema migration
**→ CLAUDE CODE, high effort.** Migration numbering against a drifted prod is
exactly the class of mistake that is painful to undo, and `seed.sql` must be
updated in lockstep or every future PR fails CI.

> Read `docs/accommodation-marketplace-spec.md` §W1/§W2 and the Database section
> of `CLAUDE.md` first.
>
> Branch: `feat/marketplace-schema`.
>
> Before writing anything, check prod's highest APPLIED migration and number
> from there — the repo's highest file is NOT authoritative (prod has drift).
> Report the number you chose and why.
>
> Add:
> - `listing_availability_blocks(listing_id, start_date, end_date, kind)` where
>   kind ∈ (booked, pending, blackout)
> - `bookings` — the reservation record, states: requested, accepted, paid,
>   moved_in, released, declined, expired, cancelled, disputed, refunded
> - `booking_events` — append-only audit trail
> - `payouts(booking_id, gross_rent, commission_net, vat, amount, state,
>   paid_at, reference)` — no bank details. Persist the fee components at
>   booking time so a later rate change never restates historic payouts.
> - `students`: `date_of_birth`, `gender`, `nationality`, `languages`, `bio`,
>   `home_university`, `receiving_university`, `receiving_faculty`,
>   `funding_source`
> - `listings.available_to`, `bedrooms`, `bathrooms`, `agency_fee`, `video_url`,
>   `smoking_allowed`, `pets_allowed`, `additional_rules`
> - widen `min_duration_months` to 2..12 and add `max_duration_months`
> - `property_verifications(listing_id, method, verified_by, verified_at,
>   checklist_json, notes)`
> - `landlords.phone`
> - `landlords.avg_response_ms` (nullable) + `landlords.response_stats_at`.
>   REQUIRED, not optional — see the note below on the /api/listings N+1.
> - a controlled `neighborhoods` table (neighbourhood is currently free text)
>
> RLS on every new user-touching table, matching existing patterns.
> If any column is NOT NULL on a seeded table, update `supabase/seed.sql` or CI
> breaks on every future PR.
>
> Update `docs/schema.md`. Do NOT apply to prod — output the SQL and the exact
> apply command for a human to run.
>
> OWNS: `supabase/**`, `docs/schema.md`.
> READ-ONLY: all of `src/`.

**Wave 2 gate:** apply to prod *before* merging any Wave 3 task that reads the
new columns (deploy races the migration otherwise — see CLAUDE.md).

### T4b — Denormalise landlord response time (pay down the T1 N+1)
**→ FAST-CODE, medium effort.** Runs immediately after T4, alone.

> Context: Wave 1's T1 added landlord response time as a ranking key on
> `/api/listings`. It is computed live, one `getLandlordResponseTime` query per
> distinct landlord in the result set, on every request — an unauthenticated,
> uncached endpoint. At 3 listings that is invisible; at 60 listings from 40
> landlords it is 40 concurrent queries against `inquiries` on every search.
> It also introduced a **service-role Supabase client on a public route**,
> which bypasses RLS and is a precedent this codebase otherwise avoids
> (CLAUDE.md: the anon client is for already-public reads).
>
> This is a specification gap in T1's brief, not a mistake by its author.
>
> Branch: `perf/denormalise-response-time`.
>
> 1. Add a `refresh-response-times` job to the `CRON_JOBS` registry built by
>    T2 (cadence `daily@03:05`), writing `avg_response_ms` and
>    `response_stats_at` onto each `landlords` row. This is the intended use of
>    the registry: a one-line entry, no new Cloudflare trigger.
> 2. Change `/api/listings` ranking to read `landlords.avg_response_ms` from
>    the existing join. NULL sorts last.
> 3. DELETE `responseTimeByLandlord()` and the `getSupabaseAsService()` import
>    from `src/app/api/listings/route.js`. The public listings route must make
>    no service-role call and no per-landlord query.
>
> Verify: `grep -n "getSupabaseAsService" src/app/api/listings/route.js`
> returns nothing, and `/api/listings` issues exactly one database round trip.

---

## Wave 3 — Surfaces *(3 tasks, parallel-safe)*

**T6 owns `en.json` this wave.**

### T5 — Student-facing listing detail + search dates
**→ REASONING, medium-high effort.** Cross-file but well-specified.
**Paste the §0.5 DESIGN CONTRACT into this prompt.**

> Read `docs/accommodation-marketplace-spec.md` §W1 and §W7.
> Branch: `feat/listing-detail-and-dates`.
>
> 1. Render on the listing detail page what is already stored but never shown:
>    `bills_included`, `min_duration_months`, `sqm`, `floor`, plus the new
>    bedrooms/bathrooms/agency fee/house rules. Add a **total cost of occupancy**
>    block: rent + bills + deposit + service fee + agency fee for the requested
>    duration.
> 2. Add move-in / move-out date search to `/results` and `/api/listings`,
>    filtering on availability and duration fit.
> 3. Add an availability calendar to the detail page: Available / Pending /
>    Booked.
> 4. Add "similar listings" to the detail page.
>
> OWNS: `src/app/[locale]/property/[city]/listing/**`,
> `src/app/[locale]/property/[city]/results/**`, `src/components/listing/**`,
> `src/app/api/listings/**`, `src/lib/transformListing.js`.
> READ-ONLY: everything landlord-side. Copy keys → `docs/pending-i18n-keys.md`.

### T6 — Landlord listing wizard
**→ REASONING, high effort.** The largest single UI build, but self-contained.
**Paste the §0.5 DESIGN CONTRACT into this prompt.** This is the task most
likely to drift — it is a from-scratch multi-step UI with no existing wizard to
copy, so the "read these three files first" instruction is doing real work here.

> Read `docs/accommodation-marketplace-spec.md` §3 in full.
> Branch: `feat/landlord-listing-wizard`.
>
> Replace the 940-line single-page `src/components/ListingForm.js` with a
> 7-step wizard, draft-saved at each step, per §3's table. Non-negotiables:
> - Step 1 uses a **geocoded address search + draggable map pin** producing
>   lat/lng automatically. Hand-typed coordinates are removed entirely, and
>   coordinates become REQUIRED.
> - Neighbourhood becomes a controlled select, not free text.
> - Step 3 university distances are **MANDATORY (≥2)**, prefilled from the
>   pin's coordinates, landlord-adjustable, with `source` recorded.
> - Step 6 enforces a minimum of 5 photos.
> - A visible status ladder: Draft → ID check → Video call → Curation → Live.
> - Add Duplicate / Disable to the My Listings row actions.
>
> Fix two live bugs while here: the dashboard greeting renders "Good to see
> you," with no name, and the verification page shows the upload form even for
> an already-verified account (the API 400s).
>
> OWNS: `src/components/ListingForm.js` + new wizard components,
> `src/app/[locale]/property/[city]/landlord/**`,
> `src/app/api/landlord/listings/**`, `src/messages/en.json`.
> READ-ONLY: student-facing surfaces, `supabase/**`.

### T7 — Ungate browsing
**→ FAST-CODE, medium effort.** Small and well-bounded.
**Paste the §0.5 DESIGN CONTRACT into this prompt.**

> Read `docs/accommodation-marketplace-spec.md` D1.
> Branch: `feat/ungate-browse`.
>
> `src/components/listing/ContactGate.js` currently replaces the contact rail
> with a signup wall for signed-out visitors. Remove the wall: signed-out
> visitors see the full listing and the booking widget, and are prompted to
> sign in only when they submit a booking request (preserve the existing
> `?next=` redirect so they land back on the listing).
>
> OWNS: `src/components/listing/ContactGate.js`,
> `src/components/listing/ContactRail.js`.
> READ-ONLY: everything else. Copy keys → `docs/pending-i18n-keys.md`.

---

## Wave 4 — Booking engine *(sequential — do NOT parallelise)*

Every task reads and writes the same booking state; overlapping agents here
will corrupt each other's assumptions.

### T8 — Reservation state machine + timers
**→ CLAUDE CODE, max effort.** The core of the product. Correctness bugs here
lose money and double-book rooms.

> Read `docs/accommodation-marketplace-spec.md` §W2 and §W6.
> Branch: `feat/booking-state-machine`.
>
> Implement requested → accepted → paid → moved_in → released, with declined /
> expired / cancelled / disputed / refunded. 48h host-accept window, then 48h
> student-payment window; an accepted booking writes a `pending` availability
> block that MUST be released when the payment window expires. Register the
> expiry sweeps and the move-in prompt as jobs in the W9 tick registry — do NOT
> add cron triggers. Write every transition to `booking_events`.
> No payment integration in this task: "paid" is set manually for now.
>
> Expiry is a **rolling inactivity timer** (reset by any message or state
> change), not a fixed countdown from creation — see spec §1.5. Send **one host
> reminder at 24h**; a silent expiry is what costs the incumbent ~87% of its
> demand. Declining requires a reason.
>
> Messaging becomes a child of the booking: every thread carries a booking id
> and status badge, and the student's first message is templated from the
> chosen dates. Reuse the existing realtime inquiry chat — do not rebuild it.

### T9 — Host reservations UI + guest profile
**→ REASONING, high effort.** Depends on T8's states.
**Paste the §0.5 DESIGN CONTRACT into this prompt.**

> Read spec §1.5 (reservation detail + guest profile) in full.
> Branch: `feat/host-reservations-ui`.
>
> **1. Reservations list.** Filter tabs with live counts — Pending approval /
> Pending payment / Booked / Declined / Cancelled — over a table with columns:
> Status · Guest · Booking date · Listing · Check-in · Check-out · Monthly rent ·
> **Receive from StudentX** · **Receive at check-in** · **Total reservation** ·
> Details. Add a **Pending payouts** tile to the landlord dashboard.
>
> **2. Reservation detail — every row is clickable** through to
> `?reservation_detail=<id>`, showing, in this order: status header · booking
> created · listing · **guest profile (clickable through to the full profile)** ·
> academic info · move-in/move-out and computed duration ("4 months and 22
> nights") · house rules echoed back · **itemised payment breakdown** · actions.
>
> The payment breakdown must itemise exactly like this, using the shared fee
> function from `src/lib/bookingFees.js` — never recompute inline:
> ```
> To collect on check-in      450.00€   (security deposit, paid direct to you)
> Payout                      326.75€   ← released 1 business day after move-in
>   First month's rent        450.00€
>   Host commission (5%)      -99.40€
>   VAT (24%)                 -23.85€
> ```
> This breakdown MUST be visible before the host confirms availability — on long
> lets the commission reaches 74% of the first month, and a host who discovers
> that after accepting will delist.
>
> **3. Guest profile.** Reachable from the reservation detail and from a message
> thread: name, photo, guest type, age, **gender**, nationality, languages, bio,
> home university, receiving university/faculty, funding answer, member-since.
> Contact details are NEVER shown — the only channel is the in-app thread.
>
> **4. Actions:** `Confirm availability` / `Decline`, both one-click.
> **Do NOT add a decline-reason field or prompt.** (T8 already records the
> transition in `booking_events`; nothing extra is needed here.)
> Do NOT build the Extra Expense / Discount modals — out of scope for this phase.
>
> OWNS: `src/app/[locale]/property/[city]/landlord/**`, new reservation
> components, `src/lib/bookingFees.js` (create if T8 has not), `en.json`.
> READ-ONLY: `supabase/**`, student-facing surfaces.

### T9b — Student profile fields (prerequisite for the guest profile)
**→ FAST-CODE, medium effort.** Can run in parallel with T9 — disjoint files.
**Paste the §0.5 DESIGN CONTRACT into this prompt.**

> Branch: `feat/student-profile-fields`.
>
> The guest profile in T9 has nothing to render without these. Extend the
> student profile (`/api/student/profile`, the student account UI, and the
> signup flow) with: date of birth (store DOB, render age), **gender**,
> nationality, languages spoken, short bio, home university, receiving
> university + faculty, and "How will you fund your stay?".
>
> All of these are required to submit a booking request, but NOT at signup —
> collect them on the account page and on the booking-request form, with a
> completeness meter. Do not add friction to signup itself (T7 just removed the
> browse gate; re-adding it at registration would undo that).
>
> OWNS: `src/app/api/student/profile/**`, `src/app/[locale]/student/**`.
> READ-ONLY: everything landlord-side. Copy keys → `docs/pending-i18n-keys.md`.

### T10 — Stripe checkout + escrow states
**→ CLAUDE CODE, max effort.** Money. Also gated on D5 (VAT/T&Cs) being
resolved with an accountant — do not start before then.

> Reuse the EXISTING Stripe account and `src/lib/stripe.js` — not Connect.
> Student pays first month + service fee; funds sit in the platform balance;
> release flips `payouts.state` to due at 1 business day after move-in and
> notifies ops for a manual transfer. Needs a business-day calculator with
> Greek public holidays. ID verification gates PAYOUT, not publish.
> Do NOT store IBANs in Supabase.

---

## Parallel-safety summary

| Wave | Run together | Must run alone | `en.json` owner |
|---|---|---|---|
| 1 | T1 · T2 · T3 | — | **T1** |
| 2 | — | **T4**, then **T4b** | n/a |
| 3 | T5 · T6 · T7 | — | **T6** |
| 4 | T9 · T9b (after T8) | T8 first, then T10 last | **T9** |

Wave 4 order: **T8 alone** → then **T9 ‖ T9b** in parallel → then **T10 alone**.

**Never run a Wave-3 task while a Wave-1 task is open** — T1 rewrites the
listing shape that T5 consumes.

**Before starting any wave:** `git fetch && git status` on a clean tree, and
confirm no other agent has an open branch touching your `OWNS` list.
