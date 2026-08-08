# Airbnb UI/UX Parity — Scope

Status: **scope for review**. Goal: rebuild `/property` (guest side) and the
landlord surfaces so the interface, information architecture and interaction
model match Airbnb's.

Companion docs: `accommodation-marketplace-spec.md` (the commercial model —
escrow, fees, booking states) and `marketplace-build-handoff.md`. This doc is
purely the **interface** layer; it assumes the marketplace model already
settled there.

Sources for everything below: a live walkthrough of `airbnb.com` on
2026-08-05 (homepage, `/s/Thessaloniki--Greece/homes`, a real
`/rooms/<id>` PDP), with computed styles read directly off the rendered
DOM, plus the founder's own host **Listings** screenshot.

---

## 0. The boundary — what "exactly" means here

Copy exactly:

- Information architecture and page/section order
- Layout system (grid, column widths, sticky behaviour, breakpoints)
- Component anatomy and interaction model
- Spacing, radii, type scale, weight discipline, shadow depth
- Copy *patterns* (tone, density, where microcopy lives)

Do **not** copy:

- The Airbnb wordmark / Bélo logo — StudentX keeps its own name and mark
- Airbnb's icon SVGs, illustrations, photography — reproduce the *style*
  with Lucide at 1.5px stroke, don't lift asset files

**Founder decision (2026-08-07) — SUPERSEDES the 2026-08-06 clone decision.**

**StudentX keeps its own visual identity.** Inter, iris `#635BFF`, `night`,
`parchment`, `stone` all stay. Rausch `#FF385C` is **not** adopted. Plus
Jakarta Sans is **not** adopted. The 2026-08-06 "clone-level, Rausch
included" decision is withdrawn in full.

What is being ported from Airbnb is **structure, not skin**: information
architecture, page and section order, layout system, component anatomy,
interaction model, and the behaviours decided feature-by-feature in §12.
All of it renders in StudentX's existing tokens.

Consequences, recorded:

- The trade-dress exposure noted on 2026-08-06 **disappears entirely** — no
  competitor mark, colour or typeface is being reproduced.
- The Airbnb Cereal licensing problem becomes moot.
- Foundation shrinks dramatically — the token-replacement sweep across ~100
  files (F1–F4) is largely cancelled. See §11.
- **The result will read as StudentX with Airbnb's structure, not as an
  Airbnb clone.** That is a deliberate, informed change of direction from the
  brief of 2026-08-06.

**Owed deliverable:** a mapping showing how every decided feature is rendered
in StudentX's colours — produced after the feature pass completes.

Layout, IA and interaction patterns are not protectable and copying them is
normal competitive practice; the two carve-outs above are the marks and asset
files, which are protectable and buy the least UX anyway.

---

## 1. Measured design tokens

Read off live airbnb.com, not from memory.

### 1.1 Type

| Token | Airbnb (measured) | StudentX today | Action |
|---|---|---|---|
| Family | `Airbnb Cereal VF`, fallback `Circular, -apple-system` | Inter (self-hosted) | See below |
| Body | **16px** (dominant), 14px secondary, 12px meta | mixed + EB Garamond display | Replace |
| `h1` (PDP) | **26px / 30px, weight 500** | `text-4xl md:text-5xl` serif | Replace |
| Card title | **15px / 19px, weight 500** | `text-2xl font-display` | Replace |
| Weights in use | **400 (1973×), 500 (421×)**, 700 (27×), 600 (10×) | 400/600/700 + serif | Replace |

**The single biggest visual tell of Airbnb is not the typeface — it's the
weight discipline.** Everything "bold" is weight **500**, not 600/700. Body
copy is 400. 700 appears ~27 times on an entire PDP. Getting this right with
the font we already ship gets ~80% of the look for zero cost.

**SUPERSEDED (2026-08-07).** No font change. **Inter stays**, as do
`font-display` / EB Garamond and `label-caps`. The measurements above are
retained as *reference* for what Airbnb does — they are no longer the target.
The one idea worth borrowing without changing any token is the **weight
discipline** (few weights, used consistently); whether to apply it is open.

Delete `font-display` / EB Garamond and the `label-caps` small-caps
convention entirely. Airbnb has no serif and no uppercase micro-labels; those
two classes are what make StudentX read as "editorial magazine" instead of
"marketplace".

### 1.2 Colour

| Role | Airbnb (measured) | StudentX today |
|---|---|---|
| Ink | `#222222` (1912 uses) | `night #0a2540` |
| Secondary text | `#6C6C6C` / `#717171` | `night/50–60` |
| Hairline / border | `#DDDDDD` | `night/10` |
| Canvas | `#FFFFFF` | `stone #fff` ✅ |
| Surface / fill | `#F2F2F2` | `parchment #f6f4ff` |
| Brand accent | `#FF385C` (7 uses — *rare*) | `blue #635BFF` |
| Primary CTA | near-black `#222` / gradient Rausch | `blue` |

Note how sparingly Rausch appears: 7 elements on a whole PDP. Airbnb's page
is functionally monochrome — near-black ink on white with grey hairlines,
and the brand colour reserved for the search button and the price CTA.
StudentX currently paints `text-blue` across 60 files. **Reducing colour is
most of the job.**

**SUPERSEDED (2026-08-07).** `#FF385C` is **not** adopted. Iris `#635BFF`
stays in the brand slot across the whole site, `night` stays as ink,
`parchment` as surface. There is **one** colour system, not two — which also
retires the unanswered scope question about which surfaces convert.

The transferable observation, independent of palette: Airbnb uses its brand
colour on roughly **seven elements per page**. StudentX currently uses
`text-blue` across 60 files. **Restraint in how often the brand colour
appears is portable; the colour itself is not being changed.** Whether to
apply that restraint is part of the owed mapping deliverable (§12).

### 1.3 Geometry

| Token | Airbnb (measured) |
|---|---|
| Card radius | **20px** (search card container) |
| Photo radius | 12px |
| Button / input radius | **8px** |
| Pill / filter chip radius | **24px** (fully round), height **34px**, `1px solid #DDDDDD`, 12px/400, padding `8px 12px` |
| Avatars, icon buttons | `50%` / `100%` — 123 circular elements per page |
| Small chips, tags | 4px |
| Elevation | `0 1px 2px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.05)` — one shadow, used sparingly |

StudentX uses `rounded-sm` (2px) in 64 files. Airbnb is a **round** system:
20px cards, 24px pills, circular controls. This inverts the current geometry
wholesale.

### 1.4 Layout

| Metric | Airbnb (measured) |
|---|---|
| Content width | 1280px |
| PDP section vertical padding | **32px top/bottom**, `24px` for host row |
| PDP sticky booking card | **373px wide, `top: 80px`** |
| Section dividers | 1px `#DDDDDD`, full content width |
| Search results | 2-col card grid (~62%) + sticky map (~38%), map fills viewport height |

---

## 2. Surface map — guest side

Airbnb PDP section order, captured verbatim from the live page (these are
literally Airbnb's own `data-section-id` values plus rendered order):

`TITLE_DEFAULT` → `HERO_DEFAULT` (gallery) → `OVERVIEW_DEFAULT_V2` →
`HOST_OVERVIEW_DEFAULT` → `HIGHLIGHTS_DEFAULT` → description → *Where you'll
sleep* → *What this place offers* → availability calendar → reviews →
*Where you'll be* (map) → *Meet your host* → *Things to know* →
*More stays nearby*.

| # | Airbnb surface | StudentX route | Today | Work |
|---|---|---|---|---|
| G1 | Header + expandable search (Where / When / Who), collapsing to a pill on scroll | `Navbar.js` (288 ln) | No search in header | **Build** — the pill↔expanded transition is the signature interaction |
| G2 | Category / filter row: `Filters` button + horizontally-scrolling amenity pills | `results/page.js` (923 ln) | Sidebar filter form | **Rebuild** |
| G3 | Filters modal (full-screen, grouped, live result count, `Clear all`) | — | Missing | **Build** |
| G4 | Search results: 2-col grid + sticky map, "Over 1,000 homes in X" heading | `results/page.js` | Grid exists; `ListingsMap.js` exists | **Rework layout** |
| G5 | Listing card: swipeable photo carousel w/ dot indicators, heart top-**right**, badge top-**left**, title + right-aligned `★ 4.67 (312)`, subtitle, meta, date, **underlined total price** | `ListingCard.js` (206 ln) | Static 4:3 photo, heart top-**left**, no carousel, no rating, price-per-month in serif blue | **Rewrite** |
| G6 | PDP gallery mosaic (1 large + 2×2, `Show all photos` pill bottom-right) + lightbox | `ListingGallery.js`, `ListingLightbox.js` | Exists, different layout | **Restyle** |
| G7 | PDP section stack in the order above | `listing/[id]/page.js` (392 ln) | Different order & sections | **Reorder + restyle** |
| G8 | Sticky booking card (373px, `top:80px`) — price, date fields, guests, CTA, fee breakdown | `BookingWidget.js` (417 ln) | Exists | **Restyle**, keep logic |
| G9 | Reviews: overall + 6 sub-ratings w/ bar chart, review grid, `How reviews work` modal | — | **No review system at all** | **Build (product, not just UI)** |
| G10 | *Meet your host* card + co-hosts + `Message host` + payment-safety notice | `landlords/[landlordId]` | Separate page | **Inline as PDP section** |
| G11 | *Things to know*: cancellation / house rules / safety, 3-col, `Learn more` | — | Missing | **Build** |
| G12 | *More stays nearby* carousel | — | Missing | **Build** |
| G13 | Wishlists (named lists, not a flat favourites set) | `FavoritesProvider.js`, `SavedListings.js` | Flat list | **Extend** |
| G14 | Checkout / *Confirm and pay* | booking flow | Partial (PR #383) | **Restyle** |
| G15 | Trips | `student/account/bookings` | Exists | **Restyle** |

## 3. Surface map — host side

From the founder's screenshot, Airbnb's host nav is:
**Today · Calendar · Listings · Messages**, with `Switch to traveling`,
avatar, and a hamburger on the right.

| # | Airbnb surface | StudentX route | Today | Work |
|---|---|---|---|---|
| H1 | Host top nav + "Switch to traveling" role toggle | `LandlordShell.js` (240 ln) | Different nav | **Rebuild** |
| H2 | **Today** — action-required banner cards ("Confirm a few key details / Required to publish"), reservation cards, task list | `landlord/dashboard` (514 ln) | Metrics dashboard | **Rebuild** |
| H3 | **Listings** grid — square photo cards, status chip overlay (`● Listed` green / `● Action required` red), title, `Home in <city>, <country>`, list/grid toggle, `+` new | `landlord/listings` | List view | **Rebuild** |
| H4 | Listing editor — Airbnb uses a **section list** (Photos, Title, Pricing, Availability…), each opening an inline editor. **Not a wizard.** | `listing-wizard/` (10 step components) | Linear wizard | **Conflict — see §5.3** |
| H5 | **Calendar** — month grid, per-night pricing, blocked dates, bulk edit | `listing/AvailabilityCalendar.js` | Availability only | **Extend — see §5.1** |
| H6 | **Messages** — thread list + conversation + guest context panel | `chat/ChatThread.js`, `landlord/inquiries` | Exists | **Restyle** |
| H7 | Reservations detail (guest, dates, payout breakdown) | `landlord/reservations/[id]` | Exists (PR #383) | **Restyle** |
| H8 | Insights / Earnings | `admin/metrics` | Admin-only | **Build host-facing** |

---

## 4. Component system to build

Phase 0 primitives, all currently in `src/components/ui/` and all needing
replacement rather than adjustment:

`Button` (5 variants incl. Airbnb's dark-fill primary and underlined
tertiary) · `Pill`/`Chip` (34px/24px-radius filter chip) · `Card` (20px) ·
`Field` (8px, floating label) · `Modal` (full-screen mobile, centred
desktop) · `Sheet` · `Popover` · `Tooltip` · `Skeleton` · `Divider` ·
`RatingStars` · `Avatar` · `Carousel` (dot indicators, keyboard + swipe) ·
`SegmentedControl` · `Counter` (guest stepper) · `DateRangePicker`
(two-month, Airbnb's own) · `PhotoMosaic` · `IconButton`.

Icons: use **Lucide** (already MIT-licensed and in the ecosystem) restyled to
Airbnb's 1.5px stroke weight. Do not extract Airbnb's SVGs.

---

## 5. Where Airbnb's model does *not* fit — decisions needed

These are the places where "exactly like Airbnb" and "works for StudentX"
diverge. Each needs a call before Phase 1 starts.

### 5.1 Nightly vs. monthly (D-A)

Airbnb's entire calendar, pricing and search UI is **per-night**. StudentX
lets are **2–12 months** with monthly rent and escrow. Airbnb's own
long-stay affordance is thin — the PDP we walked showed a *"Pay by month —
You'll pay in monthly installments"* highlight and a 91-night stay, but the
calendar is still a nightly grid.

Recommendation: adopt Airbnb's **calendar chrome** (two-month grid, range
selection, disabled-day treatment) but keep month-granularity semantics —
move-in date + duration in months. Copying nightly pricing would be copying
a mechanic you don't sell.

### 5.2 Faculty / commute-time filtering (D-B)

This is StudentX's actual differentiator and Airbnb has no equivalent —
their filter row is amenities (`Kitchen`, `Washer`, `Wifi`, `Free parking`).
`faculty_distances`, the commute quiz and `university_distances` on the card
have no Airbnb home.

Recommendation: keep them, rendered as native Airbnb components — commute
time becomes a filter chip and a card meta line, not a bespoke widget. **Do
not delete the differentiator in the name of parity.** This is the one place
I'd push back if the answer is "match Airbnb exactly".

### 5.3 Wizard vs. section-list editor (D-C)

`src/components/listing-wizard/` is 10 step components implementing a linear
flow, and PR #378/#381 (paste-text importer, distance prefill) just landed on
it. Airbnb's editor is a **section list** — every field editable in any
order, which is what makes their "Action required → Confirm a few key
details" pattern possible at all.

Recommendation: keep the wizard for **first** listing creation (it's better
for cold-start, and it's freshly built), adopt the section-list for **edit**.
Airbnb effectively does this too.

### 5.4 Reviews (D-D)

Nine of Airbnb's PDP sections depend on a review system that StudentX does
not have — the 6-category sub-ratings, `Guest favorite` badges, host rating,
`★ 4.67 (312)` on every card. Without it a "pixel-exact" PDP has holes in it.

Recommendation: reviews are a **Phase 2 product build**, scoped separately.
Until they exist, the card rating slot shows verification tier and the PDP
reviews section is omitted rather than faked.

### 5.5 Surfaces to drop

Airbnb's `Experiences` and `Services` nav tabs have no StudentX analogue —
but `/gigs` is structurally the same thing (a services marketplace). Worth
deciding whether `/gigs` becomes the third nav tab, which would make the
top-level IA match Airbnb's exactly and give gigs far more traffic.

---

## 6. Blast radius

Measured across `src/`:

| Legacy token | Files |
|---|---|
| `text-night` | 97 |
| `font-display` | 66 |
| `rounded-sm` | 64 |
| `text-blue` | 60 |
| `label-caps` | 57 |
| `parchment` | 51 |

245 JS files under `src/app` + `src/components`; **145** are in the
property / student / component tree in scope.

**This is a design-system replacement, not a re-skin.** Roughly 100 files
change. `src/messages/en.json` (73 KB) needs a parallel copy pass —
Airbnb's microcopy density is much higher than ours and every new section
(§2 G9–G12) needs keys, with the `missing-message` synthetic canary catching
gaps in prod.

---

## 7. Phasing

| Phase | Content | Rough size |
|---|---|---|
| **0. Foundation** | `globals.css` token swap, type scale, weight discipline, `ui/` primitive rewrite, icon set | 1–2 PRs, blocks everything |
| **1. Guest browse** | G1–G5, G13 — header search, filter row + modal, card, results split-view | 3–4 PRs |
| **2. Guest PDP + book** | G6–G8, G10–G12, G14–G15 | 3–4 PRs |
| **3. Host** | H1–H3, H5–H7 | 3–4 PRs |
| **4. Reviews** | G9 + H8 — product build, schema + migration + UI | 2–3 PRs |
| **5. Mobile** | Bottom tab bar, map-first results + draggable sheet, chromeless PDP + sticky CTA bar (§8.2) — a **second navigation model**, not a reflow | 3–4 PRs |
| **6. Feel pass** | Motion tokens (§10), four-state interactives, skeletons, optimistic UI, CLS/aspect boxes | 1–2 PRs |

Phase 0 must land alone and first — every later phase is a rebase conflict
against it otherwise.

---

## 8. Navigation model

Airbnb runs **two different navigation models**, not one responsive layout.
This is the single most under-estimated part of the port.

### 8.1 Desktop

| Zone | Contents |
|---|---|
| Global header | Logo (left) · product tabs `All / Homes / Experiences / Services` (centre) · `Become a host` + globe (language & currency) + hamburger account menu (right) |
| Search | **Expanded** on the homepage — `Where / When / Who` + circular Rausch submit. **Collapses to a pill** on results pages showing current state (`Homes in Thessaloniki │ Any week │ Add guests`); clicking any segment re-expands it in place |
| Secondary nav | Filter chip row — horizontally scrollable, `Filters` button pinned at its left |
| PDP sub-nav | Sticky anchor jump-nav: `Photos · Amenities · Reviews · Location` |
| Host | `Today · Calendar · Listings · Messages` + **`Switch to traveling`** role toggle + avatar + hamburger |

The `Switch to traveling` toggle matters more than it looks: Airbnb treats
host and guest as **two modes of one account**, not two account types.
StudentX currently has separate landlord and student auth trees
(`requireLandlord()` / `requireStudent()`, separate login pages). Matching
Airbnb here is an auth-model change, not a nav change — flagged as **D-E**
in §5 terms. Recommend keeping separate accounts and making the toggle a
plain link between the two surfaces; a real unified identity is out of scope.

### 8.2 Mobile — a different model, not a reflow

Measured at 375×812:

- **Bottom tab bar** replaces the header entirely: `Explore` (magnifier,
  active in Rausch) · `Wishlists` (heart) · `Log in` (avatar). Becomes
  Explore / Wishlists / Trips / Messages / Profile once authed.
- **Search results are map-first**: the map fills the viewport and results
  ride in a **draggable bottom sheet** with a grab handle
  (`Over 1,000 homes in Thessaloniki` + single-column cards). No split view.
- Header becomes: back arrow ← + **two-line centred search pill** + filter
  icon button.
- **PDP is chromeless**: full-bleed photo carousel with a `1 / 28` counter
  pill, floating back / share / heart buttons over the image, then a content
  sheet with **rounded top corners** overlapping the photo. A **sticky bottom
  bar** holds price + a full-width **gradient** CTA (`Check availability`).

StudentX has **no mobile bottom tab bar and no bottom sheet anywhere**.
This is net-new work, roughly the size of Phase 1 on its own.

### 8.3 Routing & state — where StudentX is already right

Airbnb keeps all search state in the **URL** (`place_id`,
`refinement_paths[]`, `check_in`, `check_out`, `adults`,
`flexible_trip_lengths[]`, `date_picker_type`, `search_type`), so every
result view is deep-linkable, shareable, and restored exactly by the back
button. Modals are history entries — back closes the modal rather than
leaving the page.

`results/page.js` already does this: `useSearchParams` + `URLSearchParams`
+ `replaceState` for `budget`, `types`, `neighborhoods`, `min_duration`,
`move_in`, `move_out`, `verified_only`, `sort_by`, `view`. **This part
needs no rework** — it is the one place the current build already matches
Airbnb's model. Preserve it through the rewrite rather than rebuilding it.

The gap is modal-as-history-entry: the Filters modal, gallery lightbox and
date picker must push history so mobile back closes them.

---

## 9. Functionality inventory

What Airbnb's UI actually *does*, mapped against StudentX. Only items that
are real work are listed.

### 9.1 Listing card

| Behaviour | StudentX |
|---|---|
| Swipeable photo carousel, dot indicators, arrows on hover | ❌ static single photo |
| Wishlist heart → **"save to which list?"** modal | ⚠️ flat favourites |
| Badge tiers: `Top guest favorite` / `Guest favorite` / `New place to stay` | ❌ |
| Host-type label: `Individual host` / `Business host` | ❌ |
| `★ 4.67 (312)` rating + count | ❌ no reviews |
| **Strikethrough original + discounted total** (`€433` → `€386 total`) with an `Extended stay discount` tag | ❌ |
| `Show price breakdown` inline disclosure | ❌ |
| `Pay €0 today` · `Free cancellation` trust tags | ❌ |

**`Extended stay discount` is the most directly relevant thing on this
page.** Airbnb already ships monthly/long-stay discount machinery and
surfaces it on the card as a struck-through price. A 2–12 month student let
is *entirely* that case. Recommend adopting the mechanic, not just the
styling — it is a conversion feature, not decoration.

### 9.2 Search

Filters modal (measured: 568×640, **32px radius**, shadow
`0 8px 28px rgba(0,0,0,.28)`), sections in order:

`Recommended for you` (4 icon tiles) → `Type of place` (segmented control) →
`Price range` (histogram + min/max, subtitled *"Trip price, includes all
fees"*) → `Rooms and beds` → `Amenities` (+ `Show more`) →
`Booking options` → `Standout stays` → `Property type` →
`Accessibility features` → `Host language`.

Footer is sticky: `Clear all` (underlined text button) + **`Show 1,000+
places`** — the CTA carries a **live result count that updates as you
toggle**. That live count is the whole reason the modal feels good; a
filter modal without it feels like a form.

Also: map ↔ grid hover sync (hover a card, its price pin lifts), price
bubble pins, and search-as-you-move-the-map.

### 9.3 PDP & booking

Gallery lightbox · `Show all photos` · sticky booking card · two-month date
picker · guest stepper · **price breakdown** · availability calendar ·
reviews with 6 sub-ratings + distribution bars + `How reviews work` modal ·
review translation · `Report this listing` · share sheet · `Message host` ·
payment-safety notice · cancellation-policy modal · house rules · safety
info · `More stays nearby` carousel.

Booking model: **Instant Book vs. request-to-book** (an actual filter facet),
`Pay €0 today`, monthly-instalment payment, free-cancellation window.

Instant Book is a decision (**D-F**): the marketplace spec gates at
request-to-book with landlord acceptance. Airbnb's UI assumes both exist
and lets guests filter on it. Recommend request-only for launch and keeping
the filter chip out until Instant Book is real — a facet that matches
everything is worse than no facet.

---

## 10. Feel — motion & micro-interaction

Measured off the live DOM, not estimated.

| Token | Value |
|---|---|
| Default duration | **200ms** (129 uses) |
| Larger surfaces | **250ms** (62 uses) |
| Rare / large | 300ms (7 uses) |
| Primary easing | `cubic-bezier(0.455, 0.03, 0.515, 0.955)` — ease-in-out-quad (127 uses) |
| Entrance easing | `cubic-bezier(0.2, 0, 0, 1)` — "swift out" (70 uses) |
| Animated properties | **`background` (108), `transform` (82)**, then `color`, `opacity` |
| Card hover bundle | `box-shadow, transform, border-color, background-color` together |
| Overlay z-band | 1999 / 2000 / 2001 |

The rules these imply — encode them as lint-able conventions, not vibes:

1. **200ms / ease-in-out-quad is the default.** 250ms for sheets and modals.
   Nothing over 300ms.
2. **Only animate `transform`, `opacity`, and colour.** Airbnb animates
   layout properties essentially never — 82 transform transitions, zero
   width/height. This is why it feels fast on a mid-range Android.
3. **One elevation.** Shadows belong to overlays. Cards get a border-colour
   change and a sub-pixel transform lift, not a drop shadow.
4. **Every interactive element ships four states** — hover, `focus-visible`,
   active, disabled. Currently inconsistent across `ui/`.
5. **Optimistic UI.** Hearts fill, filter chips activate, and counts update
   before the server answers.
6. **Skeletons, never spinners.** Card, PDP-section and map skeletons that
   match final geometry so nothing shifts.
7. **Reserve image boxes before load.** Fixed aspect containers — Airbnb has
   no layout shift on a cold load, and CLS is the difference between
   "premium" and "cheap" more than any token in §1.

### 10.1 Libraries

Already in `package.json`: **`motion@^12`** (Framer Motion's successor) —
enough for the sheet, modal and lightbox transitions. Nothing else needed
for motion.

Missing and needed:

- A **carousel** — card photo swipe + `More stays nearby`. `embla-carousel-react`
  (lightweight, no styling opinions).
- A **bottom sheet / drawer** — mobile results sheet and every mobile modal.
  `vaul` is the standard, or hand-roll on `motion` + a drag handler.
- **Focus/dialog primitives** — `Filters`, lightbox and date picker all need
  correct focus trapping and escape handling. Radix primitives, or accept
  the a11y debt knowingly.

`DirectoryCarousel.js` and `ListingLightbox.js` exist but are built for the
current design language; treat them as references, not foundations.

---

## 11. Build backlog

Ordered. Each item is roughly one PR. `→` lists the files it lands in.

### F — Foundation (blocks everything; land alone, first)

- **F1** Swap `next/font` to Plus Jakarta Sans 400/500; delete EB Garamond
  and the `font-display` token → `src/app/[locale]/layout.js`, `globals.css`
- **F2** Replace the colour layer: ink `#222222`, secondary `#6C6C6C`,
  hairline `#DDDDDD`, fill `#F2F2F2`, brand `#FF385C`. Retire `night`,
  `parchment`, `stone`, `blue` from marketplace scope; keep them aliased for
  `/resources`, `/ausom`, `/admin` → `globals.css`
- **F3** Type scale: 16 body / 15 card title / 14 secondary / 12 meta /
  26 h1. Enforce **400 + 500 only** → `globals.css`
- **F4** Geometry tokens: 20px card, 12px photo, 8px control, 24px pill,
  32px modal, circular icon buttons. Delete `rounded-sm` usage (64 files)
- **F5** Motion tokens: 200ms default / 250ms surfaces, the two easing
  curves, transform+opacity+colour only → `globals.css`
- **F6** Delete `label-caps` (57 files) and the small-caps convention
- **F7** Rewrite `ui/` primitives: `Button` (5 variants incl. gradient
  primary), `Pill`, `Card`, `Field`, `Divider` → `src/components/ui/`
- **F8** New primitives: `Modal`, `Sheet`, `Popover`, `Tooltip`, `Skeleton`,
  `Avatar`, `RatingStars`, `Counter`, `SegmentedControl`, `IconButton`
- **F9** Add `embla-carousel-react` + `vaul` (or hand-roll on `motion@12`);
  build `Carousel` and `BottomSheet`
- **F10** Swap `Icon.js` to Lucide at 1.5px stroke; retire `OrnamentRule`,
  `EncryptButton`, `VerifiedSeal`, `SectionHeader` decorative components
- **F11** Four-state pass on every interactive: hover / `focus-visible` /
  active / disabled

### S — Guest browse

- **S1** Header: logo · product tabs (`Homes` / `Services`→`/gigs`) ·
  `Become a host` · globe · account menu → `Navbar.js`
- **S2** Expanded search bar — `Where` / `When` / `Who` + circular Rausch
  submit, with the segment-focus behaviour
- **S3** Collapsing search pill on results + click-to-re-expand
- **S4** `DateRangePicker` — two-month grid, range select, disabled days,
  **month-granularity semantics** (§5.1)
- **S5** Filter chip row — horizontally scrollable + pinned `Filters` button
- **S6** Filters modal (568×640, 32px radius) with all 10 sections in order,
  sticky footer, `Clear all`
- **S7** **Live result count in the filter CTA** (`Show 1,000+ places`),
  updating on every toggle
- **S8** Modal-as-history-entry so back closes Filters / lightbox / picker
- **S9** `ListingCard` rewrite: photo carousel + dots, heart **top-right**,
  badge **top-left**, 15/500 title, right-aligned rating, meta, underlined
  total price → `ListingCard.js`
- **S10** Card badge tiers: `Top guest favorite` / `Guest favorite` / `New
  place to stay` + host-type label (`Individual` / `Business host`)
- **S11** `Show price breakdown` inline disclosure + `Pay €0 today` and
  `Free cancellation` trust tags
- **S12** **Extended-stay discount** — struck-through original + discounted
  total + tag. Mechanic, not just styling (§9.1) → `lib/bookingFees.js`
- **S13** Results layout: 2-col grid (62%) + sticky full-height map (38%),
  `Over N homes in X` heading → `results/page.js`
- **S14** Map: price-bubble pins, card↔pin hover sync, search-as-you-move
  → `ListingsMap.js`
- **S15** Commute/faculty filter rendered as a native filter chip + card
  meta line (§5.2) — keep the differentiator, Airbnb-shaped
- **S16** Wishlists: named lists + "save to which list?" modal
  → `FavoritesProvider.js`, `FavoriteButton.js`, `SavedListings.js`

### P — Guest PDP & booking

- **P1** Title row + `Share` / `Save`, gallery mosaic (1 large + 2×2,
  `Show all photos` pill) → `ListingGallery.js`
- **P2** Lightbox restyle + history entry → `ListingLightbox.js`
- **P3** Sticky sub-nav (`Photos · Amenities · Reviews · Location`)
- **P4** Reorder PDP to Airbnb's section order (§2) → `listing/[id]/page.js`
- **P5** `OVERVIEW` + `HIGHLIGHTS` sections (icon + title + subtitle rows)
- **P6** *Where you'll sleep* paged card row
- **P7** *What this place offers* + `Show all N amenities` modal
- **P8** Sticky booking card — 373px, `top:80px`, price, dates, guests,
  gradient CTA, fee breakdown → `BookingWidget.js`
- **P9** Availability calendar restyle → `AvailabilityCalendar.js`
- **P10** *Where you'll be* map section
- **P11** *Meet your host* inline section + co-hosts + `Message host` +
  payment-safety notice (folds in `landlords/[landlordId]`)
- **P12** *Things to know* — cancellation / house rules / safety, 3-col
- **P13** *More stays nearby* carousel
- **P14** `Report this listing` + share sheet → `ReportListingModal.js`
- **P15** Checkout / *Confirm and pay* restyle
- **P16** Trips restyle → `student/account/bookings`

### R — Reviews & trust (clone fidelity depends on this)

- **R1** Schema + migration: `reviews`, `review_categories`, aggregates on
  `listings` / `landlords`
- **R2** Post-stay review prompt + submit flow (6 sub-ratings)
- **R3** PDP reviews section: overall + distribution bars + 6 category
  scores + review grid + `How reviews work` modal
- **R4** Rating on cards, host card, search sort
- **R5** `Guest favorite` / `Top guest favorite` derivation rules
- **R6** Review translation toggle

> Cold start is genuinely solved by Airbnb's own `New place to stay` badge —
> ship R1–R2 before S10 so the badge is real and no rating is ever fabricated.

### H — Host

- **H1** Host nav: `Today · Calendar · Listings · Messages` + `Switch to
  traveling` + avatar + hamburger → `LandlordShell.js`
- **H2** **Today** — action-required banner card stack, reservation cards,
  task list → `landlord/dashboard/page.js`
- **H3** **Listings** grid — square cards, `● Listed` / `● Action required`
  status chip, `Home in <city>, <country>`, list/grid toggle, `+` button
- **H4** Section-list listing **editor** for edit mode; keep the wizard for
  first creation (§5.3) → `listing-wizard/`
- **H5** **Calendar** — month grid, blocked dates, per-listing panel
- **H6** **Messages** — thread list + conversation + guest context panel
  → `ChatThread.js`, `landlord/inquiries`
- **H7** Reservation detail + payout breakdown restyle
- **H8** Host **Insights / Earnings**
- **H9** Landlord auth/onboarding/settings/verification restyle
  → `AuthShell.js`, `FormField.js`, `ProfilePhotoSettings.js`

### M — Mobile (a second nav model, §8.2)

- **M1** Bottom tab bar — `Explore / Wishlists / Trips / Messages / Profile`
- **M2** Mobile header: back arrow + two-line search pill + filter icon
- **M3** Map-first results + draggable bottom sheet with grab handle
- **M4** Chromeless PDP: full-bleed carousel, `1 / 28` counter, floating
  back/share/heart, content sheet with rounded top corners
- **M5** Sticky bottom booking bar with gradient CTA
- **M6** All modals → bottom sheets at mobile breakpoint

### X — Feel

- **X1** Skeletons matching final geometry (card, PDP section, map)
- **X2** Optimistic UI — hearts, filter chips, counts
- **X3** Aspect-ratio boxes on every image; CLS budget ~0
- **X4** Motion audit: no layout-property animation anywhere
- **X5** Empty, error and loading states for every surface

### C — Copy

- **C1** `en.json` pass — Airbnb's microcopy density and tone across all new
  sections; every §S/§P/§R/§H key added (73 KB file, `missing-message`
  canary catches gaps in prod)

**Totals:** ~70 items, ~26–32 PRs. F must land alone; R1–R2 before S10;
everything else can parallelise across worktrees.

---

## 12. Feature decision log

Founder-decided, feature by feature. Anything not listed here is **not yet
decided** — do not build from §11 alone.

### ✅ Feature 1 — Header search bar — **BUILD, adapted**

Airbnb's geometry and expand/collapse behaviour exactly, with **two
segments instead of three**.

```
╭────────────────────────┬──────────────────────╮
│ Where                  │ When                 │  ( 🔍 Search )
│ Search destinations    │ Add dates            │
╰────────────────────────┴──────────────────────╯
```

- **`Who` segment: dropped.** Room capacity is fixed per listing; a guest
  stepper means nothing here. Two segments, so `Where` takes the extra width.
- **`Where` dropdown** — Airbnb's exactly (fig 1):
  - `Recent searches` group at top (per-user history — new persistence)
  - `Suggested destinations` group
  - Each row: **illustration tile + city name + one-line description**
  - Tile carries the **city's own colour**
- **`When` dropdown** — Airbnb's date panel (fig 2):
  - Two-month grid, range selection, `‹ ›` month paging
  - **Flexibility chips**: `Exact dates` / `± 1 / 2 / 3 / 7 / 14 days`
  - **`Dates | Flexible` segmented control: dropped.** Only the exact-date
    panel ships.
- Circular/pill **Rausch `Search`** submit with magnifier + label.

**Date semantics resolved:** a date *range* is move-in → move-out, which
yields duration implicitly. This supersedes the "move-in month + duration"
proposal in §5.1 — the range picker fits student lets fine (move in
mid-September, out end of June) and is the more faithful UI.

**Data needed — 7 cities** (`COUNTRIES` in `src/lib/cityRoutes.js`):
Thessaloniki, Athens, Larissa, Heraklion, Nicosia, London, Dublin.

| Field | Status |
|---|---|
| Colour | ✅ **already exists** — `CITY_ACCENTS` has `bg` / `ink` per city |
| One-line description | ❌ 7 to write ("Family friendly", "A hidden gem"…) |
| Illustration tile | ❌ 7 to source — **must be original**, Airbnb's are asset files (§0). Line-art at Lucide's 1.5px weight, tinted with the city's `ink` on its `bg` |

**Two implementation notes for later:**

1. **`± N days` should apply to the move-in end only.** Airbnb flexes both
   ends of a short trip; on a 9-month let, flexing move-out by ±14 days is
   meaningless to a student tied to the academic year. Recommend move-in
   flex only — flagged, not yet decided.
2. `Recent searches` needs per-user (or `localStorage`) search history,
   which does not exist today. Small, but it is net-new persistence, not
   just UI.

**Supersedes:** backlog items **S2**, **S4**. `Who`-related work in **S2**
is cut.

### ✅ Feature 2 — Collapse-to-pill on results — **BUILD**

Second state of the Feature 1 component, not a separate component.

- Homepage → bar renders **expanded**, full width.
- Any results view → bar renders **collapsed** as a header pill showing
  current search as text: `Thessaloniki │ Sep 15 – Jun 30`, or
  `Thessaloniki │ Any dates` before dates are set.
- Clicking a segment **morphs** the pill back into the full bar with that
  segment focused — a shared-layout transition, not a swap. `motion@12`'s
  layout animation handles this; budget for it being the fiddliest single
  animation in the build.
- Reclaims ~80px of vertical space on results — roughly one card row.

**Supersedes:** backlog item **S3**.

### ❌ Feature 3 — Header product tabs — **SKIP**

No `All / Homes / Experiences / Services` tab strip. Header stays logo +
search + right-hand controls.

Consequence: `/gigs` is **not** promoted to a top-level nav destination, so
§5.5's "make gigs the Services tab" question is answered — it isn't. Gigs
keeps its current entry points. Study surfaces (`/resources`,
`/student/ausom`) likewise stay out of the header.

**Supersedes:** the tabs half of backlog item **S1**.

### ◐ Feature 4 — Globe / language & currency picker — **UI SKIPPED, formatter BUILT**

No globe control in the header. English-only (`routing.js` is
`locales: ['en']`, `el.json` and `LocaleSwitcher` deleted in #158) and
EUR-only, so both of its tabs would hold exactly one option.

**But build the money formatter now.** Current state, measured:

| | |
|---|---|
| `Intl.NumberFormat` usages in `src/` | **0** |
| Files with a hardcoded `€` | **33** |
| `€` occurrences in `en.json` | **13** |
| `currency` on the listing model | ✅ already there — `transformListing.js:34`, `row.rent?.currency ?? "EUR"` |

The **schema is already currency-aware; only the display layer is not.**
Every price is a hand-written `€{n}`.

Work: one `src/lib/formatMoney.js` wrapping `Intl.NumberFormat`, taking
`(amount, currency, locale)` and reading `listing.currency` rather than
assuming EUR. Migrate all 33 files and the 13 `en.json` strings to it.

Why now and not later: **London** and **Dublin** are already in `COUNTRIES`
as `coming-soon`. The day London goes live, GBP has to reach cards, PDP,
booking, checkout, payouts and emails. Doing it now is one PR; doing it
then is a sweep across sixty call sites under deadline.

Note this makes the globe **UI** a genuinely small follow-up whenever a
second currency or locale lands — the hard part will already be done.

**Adds:** a new foundation item, **F12 — money formatter**.

### ◐ Feature 5 — "Become a host" — **NOT IN HEADER, IN THE MENU**

No standalone supply CTA in the header bar. `Become a host` **does** ship,
as a row inside the account panel (Feature 6) — present and reachable,
deliberately not prominent.

### ✅ Feature 6 — Account menu (hamburger + avatar pill) — **BUILD**

Airbnb's control exactly: one rounded pill on the header right containing
hamburger lines + circular avatar, dropping a panel beneath it.

Functionally most of this exists — `AuthMenu`, `SignInDropdown` and the
unread badge are already in `Navbar.js`. The work is the control's shape and
the panel's grouping.

**This panel is now the sole navigation to everything that is not housing**,
because Feature 3 (product tabs) was skipped. Draft structure:

```
LOGGED OUT                LOGGED IN (student)       LOGGED IN (landlord)
─────────────             ─────────────────         ────────────────────
Sign up          (500)    Messages         (badge)  Messages      (badge)
Log in                    Bookings                  Reservations
─────────────             Wishlists                 Listings
Resources                 ─────────────             ─────────────
Practice tests            Resources                 Resources
Services                  Practice tests            Practice tests
─────────────             Services                  Services
Become a host             ─────────────             ─────────────
Help centre               Account                   Account
                          Log out                   Log out
```

Study surfaces (`/resources`, `/student/ausom`) and `/gigs` sit in the
middle group in all three states — they are unreachable from the header
otherwise.

Structure above is a **draft shape, not yet approved** — ordering and
labels are open.

**Supersedes:** the account-menu half of backlog item **S1**.

### ✅ Feature 7 — Filter chip row — **BUILD, sidebar removed**

Horizontally-scrolling chip row under the header with `Filters` pinned left.
**The `results/page.js` sidebar is deleted** — every filter lives in a chip
or the modal. Results become edge-to-edge cards + map, as Airbnb's are.

#### Filter port — decided

| Current filter | Decision |
|---|---|
| Verified only | ❌ **Dropped** — redundant in the new model |
| Bills included | ✅ Chip (inverted from `bills_not_included`) |
| Furnished | ✅ Chip (inverted from `unfurnished`) |
| Air conditioning | ✅ Chip (inverted from `no_ac`) |
| No ground floor | ❌ **Dropped entirely** — see below |
| Max budget + histogram | ✅ Modal — `Price range` |
| Property type | ✅ Modal |
| Neighbourhood | ✅ Modal |
| Min duration (1/5/9) | ✅ Modal — segmented control |
| Move-in / move-out | ➡️ **Leaves filters** — becomes the `When` segment (Feature 1) |
| Sort (`sort_by`) | ❌ **Removed entirely** |
| View (`view`) | ➡️ Absorbed by the desktop split layout; survives as a mobile-only toggle |

#### Dealbreakers → positive filters

All dealbreaker semantics **invert**: `no_ac` ("AC is a dealbreaker") becomes
`Air conditioning` ("has AC"), matching Airbnb's positive-chip model. This
changes URL params, so `results/page.js` must still parse the legacy
`dealbreakers=` param for a release to avoid breaking shared links.

#### Ground floor — removed, and its dead code with it

The `ground_floor` dealbreaker is gone. Knock-on: PR #100's
`groundFloorDealbreaker` prop on `ListingCard` and the `floorNotSpecified`
pill exist **only** to serve that filter's `NULL`-floor nuance. With the
filter gone they are dead code — remove both, and the
`propylaea.results.floorNotSpecified` key from `en.json`.

`Ground floor` remains a value in the `amenities` table and still displays
on the listing; it is simply not filterable.

#### Chip row contents

Three chips from the dealbreakers alone would leave the row sparse against
Airbnb's ten. The `amenities` table already holds **19 values** (`docs/schema.md`):

> AC · Furnished · Balcony · Elevator · Parking · Ground floor · Washing
> machine · Dishwasher · Internet included · Heating · Wi-Fi · TV · Kitchen ·
> Double-glazed windows · Weekly cleaning · Microwave · Oven · Gas heating ·
> Private yard

**Approved row:** `Furnished · Air conditioning · Bills included · Washing
machine · Wi-Fi · Elevator · Parking · Balcony · Heating · Dishwasher`, with
the remaining 9 amenities in the modal's `Amenities` section behind
`Show more`. Airbnb's density, from data that already exists.

**Supersedes:** backlog items **S5**, and the filter half of **S13**.

### ✅ Feature 8 — Filters modal — **BUILD**

568×640, 32px radius, shadow `0 8px 28px rgba(0,0,0,.28)`, sticky header and
footer, scrollable body. Sections:

`Price range` (histogram + min/max) → `Type of place` → `Duration` (1/5/9
segmented control) → `Amenities` (+ `Show more`) → `Neighbourhood`.

Airbnb's own 10 sections are cut to 5 — the rest (`Rooms and beds`,
`Booking options`, `Standout stays`, `Accessibility features`,
`Host language`) have no StudentX data behind them and would be empty.

**Supersedes:** backlog item **S6**.

### ✅ Feature 9 — Live result count in the modal CTA — **BUILD**

Sticky footer: `Clear all` (underlined text button, left) + dark pill
`Show N places` (right), where **N updates on every toggle** before anything
is applied.

Implementation: a count-only endpoint mirroring
`/api/listings/price-distribution` — same filter-set query shape, `head`/count
response, debounced 300ms, edge-cached per filter combination exactly as the
distribution route already is. The client pattern to copy is
`fetchDistribution` in `results/page.js`.

**Supersedes:** backlog item **S7**.

### ◐ Feature 10 — Results heading — **BUILD, count-free**

Renders `Stays in Thessaloniki` — Airbnb's typography and position, without
the count.

Reason: Airbnb's `Over 1,000 homes in Thessaloniki` is a depth signal that
sells. At current inventory the same line reads `3 homes in Thessaloniki`,
which advertises the exact constraint the marketplace spec names (3 listings
vs. Nostus's ~294 in-city). No logic needed for the count-free version.

**⏰ Revisit 2026-09-06** — add the count back once inventory flatters it.
Scheduled reminder set (`studentx-revisit-results-count`).

### ✅ Feature 11 — Split layout + Positron tiles — **BUILD**

Desktop results become a **2-column card grid (~62%) + sticky full-height
map (~38%)**, both always visible. No desktop view toggle — this is what
retires `view=list|map` (Feature 7, item C); the param survives only as the
mobile control.

**Basemap swap: OSM default → CartoDB Positron.**

Airbnb's map is pale, desaturated and nearly label-free, so the map recedes
and the price pins carry the attention. Leaflet's default OSM tiles are the
opposite — saturated, densely labelled, every POI marked. Same component,
opposite impression. Positron is the closest free match and is a one-line
basemap URL change in `ListingsMap.js`.

Do it **with** the layout, not after: retiling later means re-tuning every
pin, cluster and overlay against a different background.

**Required companion change** — `next.config.mjs` (CSP is enforced globally
there): add the Positron tile host to **both** the CSP `img-src` allowlist
and `images.remotePatterns`. Per `CLAUDE.md`, missing either one breaks
image loading in prod.

**Known limitation, accepted:** at current inventory the map is ~38% of the
viewport holding three pins. Structurally correct, not yet doing useful work
— it becomes a real browsing tool as listings grow.

**Supersedes:** backlog items **S13** (layout half) and part of **S14**.

### ✅ Feature 12 — Price-bubble map pins — **BUILD, monthly rent**

Replace teardrop markers with Airbnb's white rounded price pills rendered
directly on the map. States: default (white), **hover** (lifts), **visited**
(solid black, so a student can see where they have already looked).

Leaflet implementation is a custom `divIcon`, not a marker image — the pin
becomes a styled DOM element, which brings collision handling with it.
Irrelevant at 3 listings; needs clustering or z-ordering rules by ~100+,
since price pills overlap far more aggressively than teardrops.

**Pill contents: monthly rent (`€450/mo`)** — *not* Airbnb's trip total.
Airbnb shows a total because a 3-night and a 5-night stay are otherwise
incomparable. StudentX prices monthly, and a total would silently reward
short stays — making a cheap 9-month let look expensive beside a pricey
3-month one. Monthly rent stays comparable across every listing regardless
of duration.

**Supersedes:** the pin half of backlog item **S14**.

### ✅ Feature 13 — Card ↔ pin hover sync — **BUILD, both directions**

- **Card → pin:** hovering a grid card scales and darkens its map pin.
- **Pin → card:** hovering a pin opens a small popup card on the map
  (photo · title · price) — a cut-down `ListingCard`. The grid does *not*
  scroll, matching Airbnb.

One piece of shared hover state lifted to the common parent that Feature 11's
split layout already requires. Without it a split view is two disconnected
panels — nine cards, nine pins, no correspondence — which is the standard
failure mode of map-and-list layouts.

**Supersedes:** the remainder of backlog item **S14**.

### ✅ Feature 14 — Search as I move the map — **BUILD**

Panning/zooming refetches results to the visible bounds.

This is an **API and schema change**, not a UI change. Requirements:

1. **Bounds params on `/api/listings`** — `min_lat`, `max_lat`, `min_lng`,
   `max_lng`, applied against `location.lat` / `location.lng`.
2. **A geospatial index — migration required.** `location` currently has
   only `idx_location_neighborhood` (`001_create_schema.sql:95`). A bbox
   query needs a composite index on `(lat, lng)`, or PostGIS if this grows.
3. **Bounds in URL state**, so the view stays shareable and back-safe —
   extends the existing `replaceState` pattern in `results/page.js`.
4. **Debounced map-move handler**, matching the existing 300ms debounce.

#### Three schema traps found while scoping this

**A. `lat` / `lng` are nullable** (post-migration 014). Any listing without
coordinates is **invisible to a bounds query** — it silently vanishes the
moment the map moves, with no indication it was ever there. This is
structurally the same NULL-invisibility trap that got the ground-floor
filter removed in Feature 7. Decide explicitly: either backfill coordinates
and make them NOT NULL, or surface uncoordinated listings outside the map
results. **Do not leave it implicit.** Count of null-coordinate rows in prod
needs checking before build.

**B. The CHECK constraint hardcodes Thessaloniki** — `lat` 40.55–40.70,
`lng` 22.80–23.05. Athens, Nicosia, London and Dublin all violate it. A
migration relaxing this is required for multi-city regardless, but bounds
search is inherently multi-city-shaped, so it surfaces here first.

**C. Sparse-inventory empty states.** At 3 listings, a half-screen pan
returns zero results. Mitigation — an explicit empty state
(*"No stays in this area"* + a `Zoom out` / `Search all of Thessaloniki`
action) rather than a blank grid.

**Open sub-decision:** automatic refetch on every map move, or a
`Search this area` button the student opts into. Airbnb does automatic.
At current inventory the manual button is far more forgiving. Not yet
decided.

**Adds:** a new backlog item, **S17 — bounds search (API + migration)**.

### ✅ Feature 15 — Pagination — **BUILD, numbered, 18/page**

**Not infinite scroll.** Numbered pagination matching Airbnb exactly.

Verified on the live desktop results page (2026-08-07): **18 results per
page**, `nav[aria-label="Search results pagination"]`, pages rendered
`1 2 3 4 … 15`, full site footer reachable at the bottom.

> Correction: an earlier draft of this spec stated Airbnb used infinite
> scroll with no pagination control. That was wrong — the live page
> paginates. Recorded so the error is not re-inherited.

Rationale, in the order it matters for StudentX:

1. **SEO.** Each page is a distinct crawlable URL with distinct content.
   Infinite scroll hides every result past the first batch from crawlers
   unless parallel paginated URLs are built anyway. `sitemap.js` and
   `robots.js` already exist and the housing directory is the lead magnet —
   organic search is the acquisition channel. Airbnb ranks regardless of
   this choice; StudentX does not.
2. **Footer reachable.** Infinite scroll makes the footer permanently
   unreachable — help, legal, trust and city links live there.
3. **Bounded DOM keeps the sticky map fast.** An unbounded grid beside a
   live Leaflet instance is the worst pairing for memory; pagination caps
   both.
4. **Back button correctness.** Returning from a listing lands on the page
   the student was on, not the top of a re-fetched infinite list.

Mobile behaviour inside the bottom sheet (Feature 57) is **not yet
verified** — do not assume it matches desktop.

**Supersedes:** backlog item **S13**'s pagination assumption.

### ✅ Feature 16 — Card photo carousel — **BUILD**

Swipeable photo carousel inside each result card: dot indicators along the
image's lower edge, arrows fading in on hover, no navigation away from
results. Aspect ratio stays 4:3 — `ListingCard` already matches Airbnb's.

Viable: listings carry **5+ photos** (founder-confirmed).

Two implementation constraints:

1. **`z-10` or it breaks.** `ListingCard` uses a stretched-link pattern — an
   absolute overlay at `z-0` covering the card, with the favourite button and
   landlord chip at `z-10` above it. Carousel arrows and dots **must** join
   the `z-10` layer, or advancing a photo opens the listing instead.
2. **Lazy-init the carousel.** 18 instances per page (Feature 15) is enough
   to matter. Mount on first interaction or viewport entry, not all 18 on
   load.

**Supersedes:** the carousel half of backlog item **S9**.

### ✅ Feature 17 — Wishlist heart (placement + treatment) — **BUILD**

State management is unchanged — `FavoriteButton` / `FavoritesProvider`
already work, including optimistic toggling. This is placement and styling
only.

- **Move top-left → top-right** (`ListingCard.js:202`). Top-left is reserved
  for the badge (Feature 19), so this move is required either way.
- **On-photo treatment**: white-stroked heart, translucent dark fill, sitting
  directly on the image rather than on a surface.
- **Activation**: fills solid Rausch with a short scale bounce.

Stays on the `z-10` layer above the stretched link.

**Supersedes:** the heart half of backlog item **S9**.

### ◐ Feature 18 — Named wishlists — **SKIP naming, restyle the grid**

**Keep the flat favourites model.** `FavoritesProvider` / `SavedListings`
stay as they are. Restyle the `/student/account` saved view to Airbnb's card
grid; no `Save to wishlist` picker modal, no list names.

Reason: Airbnb needs named lists because a user plans Tokyo, Lisbon and a ski
trip concurrently — the lists are *trips*. A student searches one city, one
move-in date, one term. Natural list count is one.

Cost avoided: `wishlists` + `wishlist_items` tables and a migration, an API
surface, the picker modal, a `FavoritesProvider` rework, and a modal placed
in front of what is currently one tap.

**Clean to add later** — the flat model is a strict subset of the named one,
so nothing built now is thrown away if students start asking to group saves.

**Supersedes:** backlog item **S16** (reduced to a restyle).

### ◐ Feature 19 — Card badge slot — **BUILD, `Verified` in it**

Take Airbnb's top-left photo-overlay badge slot (the slot the heart vacated
in Feature 17) and put **`Verified`** in it.

`PropertyVerifiedBadge` already exists but renders down in the card body
among the amenity pills — promote it to the overlay.

Rationale: Airbnb's `Guest favorite` / `Top guest favorite` tiers are derived
from review data that does not exist yet (Feature 34), and `New place to stay`
would apply to every listing, making it meaningless. Verification is a signal
StudentX *has*, and for a student about to commit a deposit it is arguably
stronger than a popularity badge.

**Review-derived tiers are added to this same slot once Feature 34 ships** —
the slot, not the badge, is what is being built now.

**Supersedes:** the badge half of backlog item **S10**.

### ❌ Feature 20 — Host-type label (`Individual` / `Business host`) — **SKIP**

No data exists — `landlords` has no type column (`docs/schema.md`), so this
would need a migration, a signup field and a backfill.

**Carry forward to the D5 legal review, not to design:** Airbnb likely shows
this partly to satisfy EU trader-disclosure rules. StudentX operates in
Greece. If landlords are traders there may be a genuine disclosure obligation
here independent of any design decision. Flagged as a pattern to check with
whoever resolves D5 in `accommodation-marketplace-spec.md` — **not** a legal
opinion.

**Supersedes:** the host-label half of backlog item **S10**.

### ◐ Feature 21 — Card star rating — **SLOT RESERVED, renders nothing yet**

Build the card title row with Airbnb's right-aligned rating slot
(`★ 4.67 (312)`) accounted for in the layout, rendering **nothing** until
Feature 34 (reviews) ships. Switching it on then is a data change, not a
layout change.

Nothing honest fills it in the meantime — response time is the only
comparable signal and `responseTimeBucket` already renders it lower in the
card as a sentence.

**Depends on:** Feature 34.

### ❌ Feature 22 — Extended-stay discount — **SKIP**

No struck-through price, no discount tag, no discount mechanic.

Recorded for completeness: this is a **pricing feature, not a card feature**.
The strikethrough is trivial; behind it sit a `rent` schema change (discount
percentage + duration threshold), a landlord editor field, and changes to
`lib/bookingFees.js` — a discount moves total stay value, which moves the 5%
host commission and its VAT, which moves the escrow payout.

It also has a cold-start problem: the tag renders only when a landlord sets
a discount, and at current inventory none would.

If revisited, sequence it with the booking/fee work, not the card rewrite.

### ❌ Feature 23 — "Show price breakdown" on the card — **SKIP**

The card price is `€450/mo` — a single figure with nothing to decompose.
Airbnb's card shows an assembled *total*, which is why their disclosure
reveals real information.

Also blocked upstream: the **guest service fee is unresolved** (D2 in
`accommodation-marketplace-spec.md` — assumed to exist, size undecided,
riding with D5). Building the control now would mean committing to a fee
structure through the UI before deciding it commercially.

Price transparency moves to **Feature 45** (booking widget + checkout),
where the numbers are real and the student is actually committing.

### ❌ Feature 24 — "Pay €0 today" card tag — **SKIP**

**Factually false under the escrow model.** Per
`accommodation-marketplace-spec.md`, the student pays first month + service
fee **at booking**; funds are held and released 1 business day after
move-in. A tag claiming nothing is paid today would be untrue on the card.

Making it true would mean abandoning the escrow hold — which is the entire
trust proposition and the reason a student does not wire a deposit to a
stranger. Not tradeable for a card tag.

Escrow trust messaging is carried by **Feature 38** (payment-safety notice),
where there is room to explain it.

### ❌ Feature 25 — "Free cancellation" card tag — **SKIP**

Unlike Features 22–24 this one *would* be truthful — §W5 of
`accommodation-marketplace-spec.md` proposes tiers encoded as data (free ≥60
days before move-in, 50% ≥30 days, 0% inside 30 days). Skipped anyway.

Note for whenever it is revisited: the tag would be a function of
`today` vs `move_in`, **not a property of the listing** — StudentX's tiers
are platform-wide where Airbnb's are per-host. Every card in a search shows
it or none do. With no move-in date entered it cannot be computed, and
showing it optimistically is how a student sees "free cancellation" on a
card and does not get it.

#### ⚠️ Carried forward — admissions-contingency gap (not a UI issue)

Raised while scoping this feature; **preserved because it outlives the
feature**. The proposed tiers have a hole specific to student housing: a
student books in spring for September, then learns in late August they did
not get their university place. Under the tiers that is inside 30 days — 0%
refund — leaving them paying for a room in a city they are not moving to.
Greek admissions results land close enough to term start that this is not
hypothetical, and Airbnb never had to solve it because no holiday is
conditional on an exam board.

May warrant its own tier or an admission-contingent clause. Route to the
§W5 / D2 owner. Discovering this via a student complaint is materially worse
than deciding it now.

---

## PDP features

### ✅ Feature 26 — Gallery mosaic — **BUILD, with single-hero fallback**

One large photo left + 2×2 grid right, outer corners rounded only,
`Show all photos` pill bottom-right. Measured: **392px tall, 24px top
padding**, positioned *below* the title row.

- **≥5 photos → mosaic.** Listings carry 5+ (founder-confirmed).
- **<5 photos → single full-width hero**, matching Airbnb's own fallback.
  Photo counts come from landlords, not a spec, so this path will be hit —
  a landlord uploading three shots of a studio must not produce a broken
  grid.

Replaces the current arrangement in `ListingGallery.js`.

**Supersedes:** backlog item **P1**.

### ◐ Feature 27 — Photo lightbox — **BUILD, ungrouped**

Full-screen viewer from `Show all photos`: scrollable grid of every photo →
click drops into a full-bleed carousel with counter. Pushes a **history
entry** (per Feature 8) so mobile back closes it rather than leaving the page.

Restyle of the existing `ListingLightbox.js`.

**Room grouping dropped.** Airbnb groups photos under `Living room` /
`Bedroom` headings, which requires per-photo room tagging. StudentX photos
are a flat array with no room metadata — adding it means a schema change plus
asking landlords to categorise every upload, i.e. friction on the supply side
that is already the constraint. A flat grid is Airbnb's own fallback for
untagged hosts.

**Supersedes:** backlog item **P2**.

### ⏳ Feature 28 — Sticky sub-nav — **DEFER to Feature 34**

`Photos · Amenities · Reviews · Location` anchor bar. Not built now.

Reason: its usefulness scales with page length. Without reviews the bar
carries three links on a page traversable in two scroll flicks. It becomes
worthwhile once the full PDP stack and Feature 34 land.

Deferring also avoids tuning scroll offsets twice — the sticky-header offset
and the interaction with the sticky booking card both need re-tuning every
time a section is added.

**Supersedes:** backlog item **P3** (moved to the Feature 34 phase).

### ✅ Feature 29 — Listing highlights — **BUILD, 3 fixed rows**

Airbnb's icon + bold-line + grey-line stack, positioned under the host row
(measured 238px tall, 32px padding). **Exactly three rows, in this order.**
No conditional ranking, no fallbacks.

| # | Row | Source | Renders when |
|---|---|---|---|
| **1** | **Commute** — `8 min walk to AUTh Medical School`, subtitle = second-nearest faculty | `faculty_distances` (precomputed; healed nightly by the `recompute-distances` cron) | Always |
| **2** | **Bills included** — subtitle names what is covered | `listings.bills_included` | When true |
| **3** | **Responds within an hour** — subtitle gives typical reply time | `landlords.avg_response_ms` via `responseTimeBucket` | Within-hour / within-day buckets only (existing staleness guard drops old stats) |

**This is where the commute differentiator lives.** It fell out of the chip
row (Feature 7 — all ten chips are amenities) and `sort_by` was removed
entirely, so without this row a student has no way to weigh distance-to-faculty
beyond a small card meta line.

**Refinement:** if the student arrived with a faculty selected, show **their**
faculty rather than the nearest. `ListingCard` already selects nearest-two, so
this extends existing logic.

Rows 2 and 3 simply do not render when their condition is false — the section
shrinks rather than substituting anything.

Subtitle copy for all three needs writing into `en.json`.

**Supersedes:** backlog item **P5**.

### ❌ Feature 30 — "Where you'll sleep" — **SKIP**

Not buildable and low value.

**No data.** `listings` has `bedrooms`, `bathrooms` (both nullable, migration
100) and `sqm`, but **no bed count and no per-room bed configuration**.
Airbnb's cards (`Bedroom 1 — 1 queen bed`) need per-room bed types, which
would mean new schema plus landlords enumerating beds room by room at listing
creation — more supply-side friction.

**Weaker value here.** The section answers "will my group of six fit", a
holiday-let question — hence sofa beds. A student renting for a year wants a
bedroom count, which is one number.

The counts that *do* exist go in the overview row instead
(`2 bedrooms · 1 bathroom · 45 m²`) — Airbnb's own `OVERVIEW_DEFAULT_V2`,
shipping with the surrounding PDP work.

**Supersedes:** backlog item **P6**.

### ◐ Feature 31 — "What this place offers" — **BUILD, present-only, icons deferred**

Two-column amenity grid + `Show all N amenities` modal. Populates entirely
from existing data — `amenities` (19 values) joined via `listing_amenities`.
Ten in the grid, remainder behind the modal button.

**Strikethrough dropped.** Airbnb strikes through missing amenities
(`Unavailable: Carbon monoxide alarm`). StudentX models amenities as
present-or-absent joins, so "absent" is indistinguishable from "landlord
did not tick it" — the same NULL-vs-false ambiguity that removed the
ground-floor filter (Feature 7). Show only what is present.

**Icons deferred.** Mapping all 19 amenities to Lucide equivalents is a
separate pass; several (double-glazed windows, weekly cleaning, gas heating)
have no obvious icon and need a considered generic.

> **Open — interim treatment.** Airbnb's grid is icon + label. Until icons
> land, decide whether rows render text-only or with a single placeholder
> glyph. Text-only changes the grid's visual rhythm noticeably.

**Supersedes:** backlog item **P7**.

### ❌ Feature 32 — PDP availability calendar section — **SKIP**

No standalone calendar section on the PDP. Dates live in the search bar
(Feature 1) and the booking card (Feature 33) only.

`AvailabilityCalendar.js` stays in the codebase for the booking card's use;
it simply gets no PDP section of its own.

Note for later: Airbnb's separate section exists to show *which nights are
already taken*, which a booking widget cannot convey until a range is
rejected. That value arrives once listings have multiple past tenancies with
gaps — not at current usage.

**Supersedes:** backlog item **P9**.

### ✅ Feature 33 — Sticky booking card — **BUILD (redesign, not rebuild)**

373px wide, pinned `top: 80px`. `BookingWidget.js` (417 ln) keeps all of its
logic — this is geometry, typography and the card shell only.

**Already present and untouched:**

| Existing | Notes |
|---|---|
| `moveIn` / `moveOut` state | Already the correct two fields; no guests concept to remove |
| `costSummary` (`lib/bookingDates`) | Cost breakdown already renders — `costDeposit`, `costAgency`, `costDueMoveIn` |
| `CANCELLATION_TIERS` (`lib/cancellationPolicy`) | Tiers are **implemented**, not proposed |
| `POST /api/bookings` | Submission + success / error / submitting states |
| `isProfileComplete` gate | Logic stays; presentation moves — see below |
| `stickyBarLabel` | A sticky-bar treatment already exists |

**Changes:** price headline reads `€450/mo` (consistent with Feature 12's
pins); fields labelled move-in / move-out and pre-filled from the search bar
rather than re-entered.

**Inherits later:** CTA label depends on Feature 43 (Instant Book); fee
breakdown detail is Feature 45. Neither affects the card's shape.

#### The profile gate moves to a modal

**Today:** when `isProfileComplete(profile)` is false, the widget sets
`needProfile` and renders `StudentProfileForm` **inline inside the card**.

**Why it cannot stay:** the card is now 373px wide and pinned at `top: 80px`.
A full profile form in that box either overflows the viewport or forces the
card to scroll independently — which breaks the sticky behaviour and the
compact shape that makes it read as Airbnb's.

**New behaviour:**

1. The completeness check stays exactly where it is.
2. If incomplete, pressing the CTA **opens a modal** containing
   `StudentProfileForm` instead of expanding the card.
3. On save, the modal closes and **the booking submission continues
   automatically** — the student does not press request twice.
4. The card never changes height.
5. The modal pushes a **history entry** (per Feature 8), so mobile back
   closes it.
6. On mobile the card becomes a sticky bottom bar (Feature 59) and this
   modal becomes a bottom sheet (Feature M6) — consistent with the rest.

**Supersedes:** backlog item **P8**.

### 🔒 Tokens — **UNCHANGED (2026-08-07)**

**StudentX's existing design system is kept.** Inter, iris `#635BFF`,
`night`, `parchment`, `stone`, `font-display`, `label-caps` — all stay. No
token replacement, no font swap, no palette swap.

Cancelled from §11's Foundation phase: **F1** (font swap), **F2** (colour
layer), **F3** (type scale), **F6** (delete `label-caps`), and the
`font-display` deletion in F1. The ~100-file token sweep does not happen.

Still needed from Foundation: **F7/F8** (component primitives — these are
required by the ported structure regardless of palette), **F9** (carousel /
sheet libraries), **F11** (four-state interactives), **F12** (money
formatter).

### ❌ Feature 34 — Review system — **SKIP**

No `reviews` table, no post-stay prompt, no PDP reviews section, no host
rating, no `How reviews work` modal.

Trust continues to rest on **escrow + verification + ID checks**, which is
the mechanism StudentX already chose. Airbnb needs reviews because it has no
escrow; StudentX went the other way, so reviews were additive here rather
than foundational.

Also recorded: the feedback loop would have been extremely slow — an Airbnb
host is reviewed every few days, a StudentX landlord once per tenancy, i.e.
roughly once every nine months. First meaningful data would arrive ~a year
after launch and listings would realistically never exceed single-digit
review counts.

#### ⚠️ Three earlier decisions depended on this — all now need revisiting

| Feature | Recorded as | Now |
|---|---|---|
| **19** Card badge slot | `Verified` now, review tiers "once Feature 34 ships" | ✅ **Confirmed** — `Verified` is permanent, no tiers ever arrive |
| **21** Card rating slot | Slot reserved for a star rating | ❌ **Dropped** — slot un-reserved, the title row is built without it |
| **28** Sticky sub-nav | "Defer to Feature 34" | ❌ **Dropped** — not built at all |

---

### ✅ Geometry, card frame & motion — **DECIDED (2026-08-07)**

**1. Radii — adopt Airbnb's scale.** `rounded-sm` (2px, 64 files) is retired.
20px card · 12px photo · 24px pill · 8px control · 32px modal. Focus-visible
keeps its 4px.

**2. Card frame — borderless, photo-as-card.** This is the larger change and
the one that actually produces Airbnb's grid.

| | Today | New |
|---|---|---|
| Container | `border border-night/10`, white fill | **no border, no fill** |
| Photo | inset inside the frame | **the photo *is* the card**, 12px radius |
| Padding | `p-5` around body | text sits directly on the page, ~12px above |
| Hover | border-colour + drop shadow | transform lift only |

Why: at eighteen cards per page (Feature 15) a bordered, filled container
reads heavy. Airbnb's grid is light because the card has no chrome at all.
**Taking the 20px radius while keeping the border and `parchment` fill gets
the least useful half of the change** — a slightly rounder box.

Knock-ons: cards now separate by grid gap rather than by border, so gap
becomes load-bearing; the `hover:shadow-[...]` on `ListingCard` is removed;
`FavoriteButton` (Feature 17) and the `Verified` badge (Feature 19) already
sit on the photo, so they are unaffected.

**3. Motion — name the properties.** `transition-all` is retired.

> **Rule:** animate only `transform`, `opacity`, and colour
> (`background-color`, `border-color`, `color`). **Never `all`. Never a
> layout property** — no `width`, `height`, `top`, `left`, `margin`,
> `padding`.

This is the portable win and it is independent of the radii: `transition-all`
animates every property that happens to change, layout included, which is
what makes hover smooth on a dev Mac and stuttery on a mid-range Android.

Derived per component — no per-case decision needed, the rule determines it:

| Component | Properties |
|---|---|
| Listing card | `transform` (+ `opacity` on photo overlay) |
| Filter chip / pill | `background-color, border-color, color` |
| Button | `background-color, transform` |
| Icon button (heart) | `transform, background-color` |
| Modal / sheet | `opacity, transform` |
| Map pin | `transform, background-color` |
| Link | `color` |
| Search pill ↔ bar morph | shared-layout animation via `motion@12` — the one sanctioned exception |

**4. Timing — adopt Airbnb's.** `200ms` default, `250ms` for larger surfaces
(modals, sheets), easing `cubic-bezier(.455, .03, .515, .955)`. Replaces
Tailwind's `150ms` / `cubic-bezier(.4, 0, .2, 1)`.

**Restores** backlog items **F4** (radii) and **F5** (motion), both previously
on hold.

### ⊘ Feature 35 — Review translation — **VOID**

Depends entirely on Feature 34, which is skipped. Nothing to translate. Also
moot on an English-only platform (`locales: ['en']`).

### ✅ Feature 36 — "Where you'll be" — **BUILD, approximate circle**

PDP location section: map with the listing as an **approximate circle, not an
exact pin**, neighbourhood name as heading, commute context alongside.

Precise address is withheld pre-booking and arrives with the booking
confirmation — the listing is someone's home, and `location.address` is
already documented as "may be approximate".

**Host-written area description dropped.** No field exists, and asking
landlords to write neighbourhood copy is supply-side friction for something
better generated centrally per neighbourhood.

Highest decision-relevance on the page for this audience: a student choosing
housing is choosing a commute and a neighbourhood, which is why commute is
Feature 29's first highlight row.

### 🗄️ Schema decision — `lat` / `lng` become **NOT NULL**

Founder call (2026-08-07). Coordinates become obligatory on every listing.

**This resolves Feature 14's trap A** — with no NULL coordinates, no listing
can silently vanish from a bounds query. The NULL-fallback proposed for
Feature 36 is no longer needed.

Migration work required, in order:

1. **Count NULL rows in prod first** — unknown, and it determines the size of
   step 2. Cannot be checked from this session (needs Supabase auth).
2. **Backfill** existing NULL coordinates by geocoding. Geocoding already
   exists in the stack — `scripts/compute_distances.py` and the wizard's
   `AddressMap.js`.
3. **`ALTER COLUMN … SET NOT NULL`** on `location.lat` and `location.lng`.
4. **Make the wizard enforce it** — `StepAddress` must not allow a listing to
   be created without a geocoded address.

> ⚠️ **Must be done in the same migration: relax the CHECK constraint.**
> `lat` is currently `CHECK 40.55–40.70` and `lng` `CHECK 22.80–23.05` —
> hardcoded to Thessaloniki. Making coordinates mandatory while the CHECK is
> city-locked means **no Athens, Nicosia, London or Dublin listing can be
> created at all**. NOT NULL turns a latent multi-city blocker into an
> immediate one.

Per `CLAUDE.md`: apply to prod **before** merging the consuming PR, and paste
the confirmation into the PR.

**Adds:** backlog item **S18 — coordinates NOT NULL (backfill + migration)**.

### ✅ Feature 37 — "Meet your host" inline — **BUILD**

Summary card low on the PDP: `LandlordAvatar`, name, verification status,
response time (`avg_response_ms` via `responseTimeBucket`), and a
`Message host` action.

All pieces exist — they are just not on the listing page today. A student
currently has to leave the PDP to learn anything about who they would be
renting from.

Stronger rationale here than on Airbnb: a student is handing over a deposit
and living in this person's property for nine months. "Who is this landlord"
is a materially bigger question than for a three-night stay, and it should not
require navigating away mid-decision.

- The full profile page at `landlords/[landlordId]` **stays** — this card
  summarises and links to it, it does not replace it.
- **Co-hosts dropped** — no such concept in the schema and no reason to
  invent one.

**Supersedes:** backlog item **P11**.

### ✅ Feature 38 — Payment-safety notice — **BUILD, own copy**

Highest-value trust element on the PDP. Greek student housing runs on cash
deposits and informal arrangements; escrow is the thing that replaces that,
and this notice is what stops a student being moved off-platform.

#### Placement — two locations

§W5 of `accommodation-marketplace-spec.md` already specifies "next to the CTA
and again at checkout — not buried in T&Cs", which is better than Airbnb's
host-section-only placement.

1. **Next to the booking CTA** — the guarantee.
2. **Under `Message host`** (Feature 37) — where the temptation actually
   occurs: opening a message thread is the moment a scammer moves a student
   to WhatsApp.
3. **Again at checkout**, per §W5.

#### Approved copy — under `Message host`

> **Your money is held, not sent.**
>
> We hold your first month's rent until you've moved in and confirmed the
> place matches its listing. Your landlord is paid one business day after
> move-in — not before. If the property isn't as described, tell
> us before then and we'll refund you.
>
> Payments made outside StudentX aren't held, can't be refunded by us, and
> are how rental scams work. If a landlord asks you to pay another way,
> report it.

#### Copy — next to the booking CTA (as originally drafted)

> **Your money is held, not sent.**
>
> We hold your first month's rent until you've moved in and confirmed the
> place matches its listing. Your landlord is paid one business day after
> move-in — not before. If the property isn't as described, tell
> us before then and we'll refund you.

> ⚠️ **Open — same-page duplication.** Paragraph 1 is identical in both
> placements, so the PDP would render those three sentences twice. §W5's
> intended repetition is *across* surfaces (listing → checkout), not twice on
> one page. Options: (a) reduce the `Message host` block to the off-platform
> paragraph only, (b) drop the CTA-side notice, (c) accept it. **Not decided.**

#### Competitive note

Nostus advertises the 24-hour framing while its terms specify five business
days — recorded in D4 of the marketplace spec. StudentX releases at **1
business day**, so **stating the real number plainly is a cheap differentiator**
rather than a disadvantage. The copy above does so deliberately.

(Nostus could not be read directly — 403 to automated requests, and the
domain is blocked in the Browser pane. Source is the repo's own prior
research.)

#### Dependency

This copy makes a promise that is only true once **W6** (move-in
confirmation) and **W3** (Stripe Connect escrow) exist. **Do not ship the
notice before the machinery.**

**Supersedes:** backlog item **P11**'s safety-notice half.

### ❌ Feature 39 — "Things to know" — **SKIP**

No three-column closing block on the PDP.

Consequence: **cancellation terms stay where they are** — inside
`BookingWidget.js` via `CANCELLATION_TIERS`, which is their only surface.
Tenancy terms (`min_duration_months`, `bills_included`) remain distributed
across the highlights row and amenities rather than collected in one place.

Recorded for completeness: Airbnb's third column (safety & property — smoke
and carbon-monoxide alarms) does not port regardless. StudentX has no such
fields, and adding them means landlords self-certifying safety equipment,
which publishes an unverified liability claim on their behalf.

**Supersedes:** backlog item **P12**.

### ⏳ Feature 40 — "More stays nearby" — **DEFER to 2026-09-06**

Horizontal carousel of other listings at the foot of the PDP. Not built now.

Its job is catching a student who has just rejected a listing — without it a
rejected listing is a dead end. Valuable, and arguably *more* so on thin
inventory, since every student who sees one listing should see the others.

Deferred for the same reason as Feature 10: with 3 listings the carousel
shows two alternatives and visibly announces how little inventory exists.

Cheap when it lands — `DirectoryCarousel` already exists; the query is a
bounded neighbourhood/distance lookup excluding the current listing.

**Threshold to revisit:** roughly 8+ listings in a neighbourhood, or 20+ in
the city.

**⏰ Attached to the existing reminder** `studentx-revisit-results-count`
(fires 2026-09-06), which now covers both this and Feature 10.

**Supersedes:** backlog item **P13**.

### ⏳ Feature 41 — Report listing — **DEFER to 2026-09-06**

`ReportListingModal.js` already exists and works. **Only the restyle is
deferred** — the feature keeps functioning throughout.

⚠️ **This deferral is not inventory-gated**, unlike Features 10 and 40.
Consequence: the report modal renders in the **old geometry (2px radii)**
inside a PDP using the **new geometry (32px modal radius)**. A visible
inconsistency, not a functional problem — but it will not resolve itself by
waiting, and it should be judged on whether the PDP redesign has shipped,
not on listing count.

Value beyond parity, recorded: this is the cheapest fraud-detection channel
available. §W4 of `accommodation-marketplace-spec.md` notes the video-call
verification confirms the room exists but **not** the building, the
neighbours, or that keys are handed over. Since escrow means StudentX pays
the refund on a misrepresented listing, catching problems pre-booking is
worth real money.

**⏰ Added to** `studentx-revisit-results-count` (fires 2026-09-06), with its
own non-inventory criterion.

**Supersedes:** backlog item **P14**.

### ✅ Feature 42 — Share sheet — **BUILD**

`Share` beside `Save` in the PDP title row.

Implementation: native `navigator.share` on mobile (gives the OS sheet with
WhatsApp already in it), copy-link fallback on desktop where the API is
unreliable.

Rationale specific to this market: student housing is rarely a solo decision
— flatmates decide together and parents usually pay, so a student needs to
send a listing to two or three people before committing. Their only current
route is copying the URL from the address bar, which is tolerable on desktop
and bad on a phone. WhatsApp and Viber, not email, are how this conversation
actually happens in Greece.

**Link previews explicitly out of scope** (founder call) — a shared URL that
unfurls without a hero image converts worse, but og-image work is not being
done for this. Noted, accepted.

**Supersedes:** backlog item **P14**'s share half.

---

## Booking features

### ⏳ Feature 43 — Instant Book — **DEFER to 2026-09-06**

Not built. StudentX stays **request-to-book only** — every booking waits on
landlord acceptance. No Instant Book filter chip (which also keeps Feature 7's
chip row honest: a facet matching everything is worse than no facet).

⚠️ **Deferred against conversion data, not inventory.** Recorded because the
argument for building it comes from the founder's own audit:

- Nostus lost **41 of 47 reservations (~87%)**, and the recorded cancel reason
  was a rolling **2-day inactivity timer** expiring threads where the *host*
  did not reply — not students changing their minds.
- `accommodation-marketplace-spec.md` calls this "the single most actionable
  finding in the audit".
- StudentX's own dashboard showed average landlord response time of
  **1 day 10 hours**. A request-only funnel at that latency converts close to
  nothing.

Instant Book is the *structural* fix — it removes the landlord from the
critical path. The mitigations already planned (24h host reminder, response
time as a landlord-facing performance number, response time weighted in
ranking) all try to make landlords faster instead; Instant Book makes their
speed irrelevant for listings that opt in.

Counter-argument, also real: a landlord letting their own property for nine
months wants to know who is moving in, and escrow commits money before anyone
has vetted anyone. Per-listing opt-in (Airbnb's model) resolves this — and
makes the chip meaningful, since it genuinely varies.

**Threshold to revisit:** real landlord response time and actual
request→booking conversion, once there is booking data. **Not** listing count.

**⏰ Added to** `studentx-revisit-results-count` (fires 2026-09-06) as its
conversion-gated item.

### ✅ Feature 44 — Request-to-book treatment — **BUILD**

The flow exists; this adopts Airbnb's presentation of it. Four parts:

1. **Explicit CTA** — `Request to book`, with `You won't be charged yet`
   directly beneath. The `noCharge` key already exists in `BookingWidget.js`.
2. **Host response expectation shown at request time** — how long this
   landlord typically takes, so the wait is framed rather than open-ended.
   Data already flows: `avg_response_ms` → `responseTimeBucket`, same source
   as Feature 29's third highlight row.
3. **Visible pending state after submitting**, with the request's **expiry
   shown to the student**.
4. Pending state reachable from `/student/account/bookings`.

**Why (3) matters most** — from the audit: Nostus killed ~87% of requests on
a silent 2-day inactivity timer. The planned fix is host-side (a 24h
reminder instead of silent expiry), but the **student side is unaddressed**.
A student who can see "the landlord has 36 hours left to respond" waits; a
student staring at nothing books elsewhere.

**Pairs with:** Feature 43's deferral — with no Instant Book, this flow is
the *only* booking path, so its conversion characteristics carry the whole
funnel.

### ◐ Feature 45 — Student-facing cost display — **BUILD, single figure**

Airbnb itemises rate × nights + fees. Under the revised escrow model
(PR #384) **only the first month's rent flows through StudentX**, so there
is nothing to itemise. The student sees **one number**.

#### Decided

| Item | Decision |
|---|---|
| First month's rent | ✅ The only figure in the cost summary |
| Deposit — as a **cost line** | ❌ Removed. StudentX must not itemise money it does not touch |
| Deposit — as a **listing fact** | ✅ **Stays visible on the listing.** `rent.deposit` is real data the landlord entered and `ListingPreview` already shows it |
| Agency fee | ❌ **Deleted outright** — a directory-era concept. In a marketplace taking 5% from the landlord, a separate student-facing agency fee belongs to nothing |
| Guest service fee | Still D2/D5-blocked; leave a slot, do not invent a number |

**Why the deposit stays on the listing:** there is a difference between *not
itemising* a cost in checkout and *removing* a known cost from the listing.
Fully hiding it means a student budgets €450, arrives, and is asked for
another €450 — the exact surprise escrow exists to prevent, merely relocated.

#### Work

- `costSummary` (`bookingDates.js`) — drop `deposit`, `agencyFee`,
  `due_at_move_in` from params and return shape
- `BookingWidget.js:305–312` — remove the deposit + agency lines
- `StudentBookingDetail.js:156` and `landlord/reservations/[id]:151` — update
  call sites
- `bookingService.js:180` — update
- Remove `listing.agency_fee` end to end, including the wizard's price step
- Orphaned `en.json` keys: `costDeposit`, `costAgency`, `costDueMoveIn`

**Depends on:** PR #384 (merged escrow-model change).

### ❌ Feature 46 — Pay later — **SKIP**

Incompatible with the model. Protection depends on holding the first month's
rent from booking until 1 business day after move-in; paying later means
holding nothing, so there is nothing to release and nothing to refund.

Nothing to split either — Airbnb splits a *total* across instalments; the
StudentX student pays one month, once.

The genuine "pay later" already exists: request-to-book charges nothing until
the landlord accepts, which is what Feature 44's `noCharge` line states.

### ✅ Feature 47 — "How paying works" section — **BUILD**

Replaces Airbnb's `Pay by month` highlight. Answers the five questions the
booking card leaves open: what do I pay now, when does the landlord get it,
what about the deposit, what about months 2+, and what if something is wrong.

**Placement:** PDP (after the host section) **and** checkout. No separate page
— `/property/[city]/about` exists, but sending a student off the listing
mid-decision is worse than three blocks in place.

#### Approved copy (founder-written; typos corrected)

> ### How paying works
>
> **Step 1 ·** Chat with the landlord and confirm the property meets your
> expectations. After, transfer the first month's rent to us.
>
> **Step 2 ·** We hold it until you've moved in. The landlord is transferred
> the rent one business day after your arrival, so you have until then to
> confirm the property is as you expected.
>
> **Step 3 ·** After that, it's between you and your landlord.

#### Resolves the Feature 38 duplication

The CTA-side payment-safety notice is **cut to the off-platform warning
alone** — this section now carries the held-money explanation, so the
guarantee paragraph is no longer printed twice on one page.

CTA-side notice becomes:

> Payments made outside StudentX aren't held, can't be refunded by us, and
> are how rental scams work. If a landlord asks you to pay another way,
> report it.

#### ⚠️ Two open issues

**1. Step 3 no longer answers the deposit question.** The earlier draft read
"The deposit and every month's rent from the second month onward are paid to
them directly." Trimmed, it does not tell a student a deposit is coming —
reintroducing the €450-becomes-€900 surprise Feature 45 was designed around.
**Recommend restoring that clause.**

**2. ✅ RESOLVED — confirmation window is "until the landlord is paid".**

Step 2 promised the student has until the landlord is paid (T+1 business
day) while Feature 38's copy and §W6 said **24 hours**. A Friday-evening
arrival closes a 24h window on Saturday evening but is not released until
**Monday** — the copy would have promised two days more than the system
enforced, in the scenario most common for a September move-in.

**Decided 2026-08-07: one rule — the confirmation window runs until the
landlord is paid (T+1 business day after arrival).** Always ≥24h, more
generous, one fewer number in the system.

Applied:
- `accommodation-marketplace-spec.md` §W6 — implicit-confirmation rule
  changed from 24h to T+1 business day, with the reasoning recorded.
- Feature 38 copy — "tell us within 24 hours of arriving" → "tell us before
  then", which now inherits Step 2's deadline rather than stating a second
  number.

### ❌ Feature 48 — Free-cancellation window (resolved date) — **SKIP**

Airbnb resolves its cancellation tiers against the actual move-in date into
a single sentence (*free cancellation until 2 July*). StudentX keeps showing
the tiers themselves.

`CANCELLATION_TIERS` (`lib/cancellationPolicy.js`) continues to render as-is
in `BookingWidget` and `StudentBookingDetail` — free ≥60 days before move-in,
50% ≥30 days, 0% inside 30 days.

Still unresolved beneath this, and unaffected by the skip: the
**admissions-contingency gap** recorded under Feature 25.

**Owed deliverable:** a mapping showing how each decided feature renders in
StudentX's colours — produced after the feature pass completes.

---

## 13. Open — needed to finish the host-side spec

The host dashboard is behind auth and no Chrome session was connected, so
§3 is built from one screenshot plus route inventory. To specify H2/H4/H5/H6
to the same fidelity as the guest side, capture from a logged-in host
account:

1. **Today** — full page, including the action-required card stack
2. **Calendar** — month view with a date panel open
3. **Listing editor** — the section list, and one section expanded
4. **Messages** — thread list + open conversation
5. **Listings** — the list/grid toggle in list mode
6. Any **Insights / Earnings** page

Either paste them here, or connect the Claude-in-Chrome extension and the
walkthrough can be finished live against the real dashboard.

---

## Host features

> Source screenshots supplied by founder 2026-08-07: current StudentX landlord
> dashboard; Airbnb **Today**; Airbnb **Listings**; Airbnb **Messages** (three-pane);
> Airbnb message-row zoom. **Calendar was deliberately not captured — see Feature 52.**

### ✅ Feature 49 — Today dashboard — **BUILD**

Replaces `landlord/dashboard/page.js` (514 ln), currently a six-tile metrics
dashboard with listings and inquiries panels below.

**Airbnb's Today, as captured:** segmented `Today` / `Upcoming` pills, a
`Filter` control top-right, a large centred count heading
(*"You have 1 reservation"*), one card per item — `All day` label, composite
avatar (guest photo + property photo), a bold human sentence
(*"André's group of 2 stays for 5 more days"*), listing name as grey
subtitle — and a `See all reservations` link at the foot. **No metrics
anywhere.**

**Navigation change:** the left sidebar (`DASHBOARD / LISTINGS / RESERVATIONS /
INQUIRIES / VERIFICATION / SETTINGS`) becomes a **top nav: `Today · Listings ·
Messages`** — no Calendar (Feature 52). Verification and Settings move into the
account menu.

**Why this matters more than its position suggests:** the audit
(`accommodation-marketplace-spec.md`) shows landlord response latency *is* the
conversion mechanism — average response time is **1d 10h**, and landlords race
each other, not just a timer. A metrics dashboard reports how a landlord did; an
action list tells them what to do next. Today should lead with
*"2 requests waiting, oldest 14 hours"*, not `CONVERSION RATE 0%`.

**Action-required cards** map exactly onto the go-live gate (`listingGoLive.js`):
ID verification, completed video call, admin approval. Three blockers a landlord
currently has to piece together from separate pages.

> **Open — the six metric tiles.** Airbnb's Today has none; StudentX has
> `ACTIVE LISTINGS / PENDING REQUESTS / PENDING INQUIRIES / VIEWS THIS MONTH /
> CONVERSION RATE / AVG. RESPONSE TIME`. Not yet decided whether they are
> dropped, demoted below the action list, or reduced to response time reframed
> as a prompt rather than a stat.

### ❌ Feature 52 — Host calendar — **SKIP (founder call)**

Deliberately excluded. Host nav is `Today · Listings · Messages` only.

Consistent with Feature 32 (no PDP availability calendar): a mid-term let has
one move-in and one move-out, so a nightly availability grid earns far less
than it does on Airbnb.

#### ✅ Feature 49 addendum — the six metric tiles, re-homed (2026-08-07)

The tile grid is **removed** from the host dashboard. Every metric moves to
where it does work rather than reports a score:

| Tile | New home |
|---|---|
| `ACTIVE LISTINGS` | **Landlord public profile** ("About me") |
| `AVG. RESPONSE TIME` | **Landlord public profile**, as *average reply rate* |
| `PENDING REQUESTS` | **Dot on the `Messages` nav tab** — no number, just presence |
| `PENDING INQUIRIES` | **Dot on the `Messages` nav tab** |
| `VIEWS THIS MONTH` | **Top-right of the host nav**, where Airbnb puts `Switch to traveling` |
| `CONVERSION RATE` | ❌ **Dropped** (2026-08-08) — not needed as a metric at all |

### ✅ Landlord public profile — "About me" — **BUILD**

Students can view a landlord's profile. Modelled on Airbnb's `About me` card:
circular avatar with a verified badge overlapping its lower-right, name,
location beneath, and a right-hand stat column with hairline dividers, plus a
shield + `Identity verified` line under the card.

**StudentX stats column** (Airbnb's are Trips / Reviews / Years):

| Stat | Source |
|---|---|
| Active listings | count of `listing_status = 'active'` for the landlord |
| Average reply rate | `landlords.avg_response_ms` via `responseTimeBucket` |

No review count — Feature 34 is skipped.

Extends the existing `landlords/[landlordId]` page; Feature 37's inline PDP
card summarises and links to it.

### ✅ Feature 50 — Listings grid — **BUILD, with rent**

Three-up grid of photo cards replacing the current row list.

- **Status chip overlaid top-left**: `● Listed` (green) / `● Action required`
  (red). **Binary, exactly as Airbnb** — the granular states are not chips.
- **Title** beneath the photo, then **rent** (`€500/mo`) as the grey subtitle
  — *not* Airbnb's `Home in <city>, <country>`. A landlord knows where their
  own properties are; they are comparing prices.
- **List/grid toggle** and **`+`** button, top-right.
- Photo carries the same 12px radius / borderless treatment as the guest card.

#### Action-required banner

Floating card above the page content — as Airbnb's, and it **follows the host
across tabs** (it appears on both Listings and Messages in the captures) until
resolved.

**The granular go-live states live in the banner, not on the card:** `draft`,
`submitted`, awaiting ID verification, awaiting video call, awaiting admin
approval. The card says only that action is required; the banner says which
step, and links to it. All derive from `listingGoLive.js` — do not
reimplement the gate inline.

### ◐ Feature 51 — Listing editor — **BUILD section-list for EDIT, keep the wizard for CREATE**

| Path | Editor |
|---|---|
| **Create** (first listing) | ✅ **Keep `src/components/listing-wizard/`** — a guided order genuinely helps a first-time landlord, and PRs #378/#381 recently landed the paste-text importer and distance prefill on it |
| **Edit** (existing listing) | ✅ **New section list** — Photos · Title & description · Price & terms · Address · Amenities · Availability, each opening in place, any order |

**The section list is what makes Feature 50's banner work.** Airbnb's
"Confirm a few key details / Required to publish" card deep-links straight to
the one incomplete section. A linear wizard has no such landing point — it can
only restart the flow.

**The banner routes to two different destinations**, because two of the five
go-live blockers are not listing fields at all:

| Blocker | Banner links to |
|---|---|
| `draft` / `submitted` — missing listing fields | The specific **editor section** |
| Awaiting **ID verification** | `landlord/verification` |
| Awaiting **video call** | Video-call scheduling |
| Awaiting **admin approval** | Read-only status — nothing for the landlord to do |

All blocker states derive from `src/lib/listingGoLive.js`. Do not reimplement
the gate inline.

### ✅ Feature 53 — Messages, three panes — **BUILD**

Messaging already works (`ChatThread.js`, `landlord/inquiries`). This is the
shell and the row treatment.

**Three panes**, as captured:

| Pane | Contents |
|---|---|
| **Left — thread list** | `Messages` heading + search + settings icons; `All ▾` / `Unread` filter pills; one row per thread |
| **Centre — conversation** | Participant header with avatar + chevron; centred system lines (`Inquiry sent · Aug 6 – 20`); guest bubbles light/left, host bubbles dark/right; sender label + time above each; composer with `+` and saved-replies affordances |
| **Right — Reservation panel** | Booking tied to the thread. **Collapsible via `×`** |

#### Thread row — the composite avatar (founder-flagged)

**Every row's icon is the listing's main photo**: a rounded-square property
photo with the **guest's circular avatar overlapping its lower-left**. Not the
guest avatar alone — with several listings a landlord identifies the thread by
*which property* first.

Row contents: composite avatar · participant names · timestamp (right) ·
preview line · `<dates> · <listing name>`.

#### Why the right-hand panel matters more here than on Airbnb

Airbnb's exists because a host juggles many concurrent short stays. StudentX's
justification is the audit: landlords are **racing each other** to respond
(students shotgun parallel requests, losers auto-cancel), and average response
time is 1d 10h. Putting dates, guest profile and accept/decline in the same
view as the message removes the round-trip that costs the booking.

### ⏳ Feature 54 — Host Insights / Earnings — **DEFER to 2026-09-06**

No host-facing analytics or earnings page. `admin/metrics` stays admin-only.

Deferred because there is nothing to chart: 3 listings, no completed
bookings, no payouts.

**This is the natural home for `CONVERSION RATE`** — the one metric tile left
unassigned when the dashboard grid was re-homed (Feature 49 addendum). Also
the home for earnings: paid out, held in escrow, due.

⚠️ **Data-gated, not inventory-gated.** The threshold is completed bookings
and payouts existing at all, not listing count.

**⏰ Added to** `studentx-revisit-results-count` (fires 2026-09-06) as its
second data-gated item, alongside Feature 43.

### ❌ Feature 55 — "Switch to traveling" role toggle — **SKIP**

No host/guest mode switch. Landlord and student remain **separate accounts**
with separate sign-in — `requireLandlord()` and `requireStudent()` stay as
they are.

Reasons, in order of weight:

1. **It is an auth-model change, not a nav change.** Airbnb treats host and
   guest as two modes of one identity; StudentX has two account types with
   separate auth trees and login pages. Unifying them is substantial work.
2. **The overlap is near nil.** A landlord letting property in Thessaloniki
   and a student looking for a room are not usually the same person.
3. **The slot is taken.** Feature 49's addendum puts `views this month` at the
   top-right of the host nav — exactly where Airbnb renders this toggle.

If a person is genuinely both, they sign in separately.

**Closes the host group.** Features 49–55 all decided.

---

## Mobile features

> **Top bar vs bottom bar — both, at different breakpoints.** Airbnb's *desktop*
> host nav is a top bar (`Today · Calendar · Listings · Messages`). Below the
> mobile breakpoint the header is replaced by a **bottom tab bar** — verified in
> session at 375×812, where the Thessaloniki results header collapsed to a back
> arrow + two-line search pill and navigation moved to `Explore · Wishlists ·
> Log in` at the foot. Features 1–55 describe the desktop top nav; Feature 56 is
> what replaces it on mobile. Both ship.

### ✅ Feature 56 — Mobile bottom tab bar — **BUILD, both sides**

Net-new — StudentX has no bottom tab bar today. It is also the piece that makes
Features 57–59 coherent: the map-first sheet, chromeless PDP and sticky booking
bar all assume navigation is held at the foot, which is why the PDP can drop its
header entirely.

**Founder-specified contents:**

| Role | Tabs |
|---|---|
| **Guest, signed out** | `Explore` · `Log in` |
| **Guest, signed in** | `Explore` · `Wishlists` · `Messages` · `Profile` |
| **Landlord** | `Today` · `Listings` · `Messages` · `Profile` |

- The landlord bar mirrors the desktop host nav minus Calendar (Feature 52).
- `Messages` carries the **dot indicator** specified in the Feature 49 addendum
  — pending requests and inquiries were re-homed onto it.
- **The two bars never coexist.** Feature 55 skipped the role toggle, so a
  session is either landlord or student; the bar is chosen by role at render
  with no switching affordance. Simpler than Airbnb, which must handle the
  transition.

#### ⚠️ Two consequences, recorded

**1. Bookings are not a tab.** Airbnb gives signed-in guests a `Trips` tab; the
StudentX bar does not. A student's active booking therefore lives under
`Profile`, two taps deep. Post-booking, *"where is my booking, and when am I
paying"* is that student's top task — and Feature 44 puts the request's pending
state and expiry there too. Flagged, not overridden.

**2. `/gigs`, `/resources` and `/ausom` are reachable only via `Profile`.**
Feature 3 skipped product tabs, so the account menu is already their sole route
on desktop. On mobile three whole product areas sit behind a Profile icon — and
mobile is where students are. This is Feature 3's discoverability cost arriving
here rather than there.

### ◐ Feature 57 — Mobile results — **LIST-FIRST with a map toggle** (not map-first)

Airbnb inverts the results page on mobile: full-viewport map with listings in a
**draggable bottom sheet**. StudentX does **not** adopt this.

**List-first stays**, with the existing `view=list|map` toggle as the mobile
control — the param Feature 7 deliberately kept alive when the desktop split
retired it.

Reasons:

1. **Different search problem.** Airbnb goes map-first because a traveller is
   choosing an unfamiliar neighbourhood. A student is choosing a **commute** —
   which is why `faculty_distances` exists, why commute is the first PDP
   highlight (Feature 29), and why distance sits on the card. A map does not
   answer "how far from my faculty"; the card meta line does.
2. **Inventory.** A full-screen map with three pins is a great deal of screen
   for very little, the same objection that deferred Features 10 and 40.
3. **Avoids a primitive.** No draggable sheet is needed for results, so `vaul`
   (or a hand-rolled `motion@12` sheet) is required only by Feature 59 and the
   modal-to-sheet conversion, not here.

The map itself is unchanged — Positron tiles, price-bubble pins and hover sync
(Features 11–13) all still apply when the toggle is set to map.

### ✅ Feature 58 — Chromeless mobile PDP — **BUILD**

No header below the mobile breakpoint. Structure, as captured at 375×812:

1. **Full-bleed photo carousel**, edge to edge, with a `1 / 28` **counter pill**
   bottom-right.
2. **Floating controls over the image** — back arrow (top-left), share + heart
   (top-right). No bar, no background; the buttons sit directly on the photo.
3. **Content sheet with rounded top corners**, overlapping the photo's lower
   edge. Title, meta and rating are centred within it.

Works because Feature 56's bottom tab bar holds navigation, freeing the top of
the screen. This is most of what makes a listing read as an app rather than a
website on a phone.

**Reuses decisions already made** — carousel (16), heart (17), share (42),
gallery + single-hero fallback below 5 photos (26). Genuinely new: the floating
control treatment and the overlapping sheet.

**Consequence, recorded:** `back` becomes a floating arrow, not site navigation.
A student arriving from results is fine, but one landing directly from a shared
WhatsApp link (Feature 42) reaches the rest of the site only via the bottom bar.
Airbnb behaves identically — a property, not a defect.

### ✅ Feature 59 — Sticky mobile booking bar — **BUILD**

Pinned to the foot of the mobile PDP: price on the left, full-width CTA on the
right. Mobile counterpart of Feature 33's sticky card, which cannot work at
375px with no sidebar to pin to.

Without it the only route to booking is scrolling back to the inline widget, on
a page that now has no header to anchor against (Feature 58). **This is what
makes the chromeless PDP viable rather than frustrating.**

Inherits three earlier decisions:

| Element | Value | From |
|---|---|---|
| CTA label | `Request to book` + the no-charge line — **not** Airbnb's `Check availability` | Feature 44 (request-only; Instant Book deferred) |
| Price | First month's rent, single figure | Feature 45 |
| Profile gate | Opens as a **bottom sheet**, not a modal | Feature 33 |

> **This is now the only surface that requires the sheet primitive.** Feature 57
> dropped the map sheet, so `vaul` (or a hand-rolled `motion@12` sheet) is
> needed here and for the modal→sheet conversion, nowhere else.

**Stacking:** the bar coexists with Feature 56's tab bar. **Hide the tab bar on
the PDP** — Airbnb's approach, and consistent with the page being chromeless.

---

**Feature pass complete — 59 of 59 decided.**

---

## 14. Rendering map — Airbnb structure in StudentX colours

The deliverable owed since the 2026-08-07 decision to keep StudentX's identity
(§0). **Nothing here changes a colour or a typeface.** It states which existing
token renders each Airbnb element.

### 14.1 Direct token substitutions

| Airbnb | Their value | StudentX token | Value |
|---|---|---|---|
| Ink | `#222222` | `night` | `#0a2540` |
| Secondary text | `#6C6C6C` | `night/60` | — |
| Hairline / border | `#DDDDDD` | `night/10` | — |
| Surface fill | `#F2F2F2` | `parchment` | `#f6f4ff` |
| Canvas | `#FFFFFF` | `stone` | `#ffffff` |
| Brand / CTA | Rausch `#FF385C` | `blue` (iris) | `#635BFF` |
| Gradient CTA | Rausch→magenta | **`.bg-brand`** — already exists | `--gradient-brand` |
| Body + display type | Cereal 400/500 | **Inter**, unchanged | `--font-sans` / `--font-display` |

`.bg-brand` (iris → magenta → yellow) is the existing utility and already
carries the wordmark gradient — it is the natural fill for Feature 59's
full-width mobile CTA, where Airbnb uses its own gradient.

### 14.2 What genuinely changes (decided 2026-08-07)

Geometry and motion only — see the decision block earlier in this document.

| | Before | After |
|---|---|---|
| Radii | `rounded-sm` 2px (64 files) | 20 card · 12 photo · 24 pill · 8 control · 32 modal |
| Card frame | bordered + `parchment` fill, photo inset | **borderless, photo-as-card** |
| Motion | `transition-all` 150ms | named properties, 200ms / 250ms |

### 14.3 Semantic states — and the one gap

Existing vocabulary, from `src/components/ui/Pill.js`:

| Meaning | Token |
|---|---|
| Verified | `yellow` `#ffcb57` |
| Pending / unactioned | `magenta` `#ff5fa2` |
| Neutral / amenity | `parchment` |
| Info / actioned | `blue` |

Maps cleanly onto most parity features:

- **Feature 19** — `Verified` badge in the card's photo-overlay slot → `yellow`,
  the existing `verified` variant.
- **Feature 50** — `● Action required` → `magenta`. `pending` already means
  "unactioned state", so the fit is exact.
- **Feature 53** — Messages tab dot → `magenta`, consistent with unactioned.

> ⚠️ **Gap: StudentX has no success/positive colour.** Airbnb's green
> `● Listed` has no equivalent — `yellow` already means *verified* (a
> collision), and `blue` is the brand colour used across 117 files, so a blue
> chip reads as branding rather than status.
>
> **Recommendation — asymmetric treatment, no new token:** render `Listed` as a
> **neutral chip** (`parchment` fill, `night` text, no dot) and `Action
> required` in `magenta` with its dot. "Everything is fine" does not need
> colour; "something is wrong" does. This preserves the palette exactly and is
> arguably better UX than two competing coloured chips.
>
> Alternative, if a true green is wanted, is adding one semantic token — a
> palette *addition*, not a change. **Not decided.**

### 14.4 Elements needing no mapping

Airbnb's monochrome discipline is already StudentX's: near-black ink on white
with hairline borders. The transferable observation from §1.2 — Airbnb uses its
brand colour on ~7 elements per page, StudentX uses `text-blue` across 60 files
— stands as a **restraint** recommendation independent of palette. Applying it
is optional and not part of any decided feature.

### ✅ §14.3 resolved — status chips are asymmetric (2026-08-08)

Founder approved the recommendation. **No new palette token.**

| State | Treatment |
|---|---|
| `Listed` | **Neutral chip** — `parchment` fill, `night` text, **no dot** |
| `Action required` | **`magenta`** with its dot — the existing `pending` variant |

Rationale: "everything is fine" does not need colour; "something is wrong"
does. Preserves the palette exactly, avoids the `yellow`-means-verified
collision, and avoids `blue` reading as branding rather than status.

### ❌ `CONVERSION RATE` — **DROPPED** (2026-08-08)

Not re-homed anywhere and not deferred. Removed as a metric entirely.

Supersedes the Feature 49 addendum's open row and removes it from Feature 54's
scope — the September reminder's C2 item no longer needs to resolve where it
lives.

---

## 15. Open sub-decisions — resolved 2026-08-08

**Feature 1 — `± N days` flexes BOTH ends.** Move-in *and* move-out. Supersedes
the earlier recommendation to flex move-in only.

**Feature 47 — Step 3 stays as written; it does NOT mention the deposit.**
Founder's call: a deposit is standard in Greek lets and naming it is more
confusing than omitting it. Supersedes the recommendation to restore the
clause. The deposit remains visible on the listing itself (Feature 45).

**Feature 31 — amenity placeholder tiles: opaque pastel squares.**

Reuses the `CITY_ACCENTS` construction (pale opaque `bg` + saturated `ink`).
**Define as a separate `AMENITY_ACCENTS` constant** — same values initially,
but importing `CITY_ACCENTS` would mean a city palette tweak silently
restyling every amenity tile.

| Group | Amenities | bg / ink |
|---|---|---|
| Kitchen & cooking | Kitchen · Oven · Microwave · Dishwasher | `#FFF4D6` / `#A87015` |
| Climate & comfort | AC · Heating · Gas heating · Double-glazed windows | `#E8EEFF` / `#3148A8` |
| Laundry & cleaning | Washing machine · Weekly cleaning | `#E6F2E6` / `#2F6B3A` |
| Connectivity & media | Wi-Fi · Internet included · TV | `#EAE3F2` / `#5B3A8A` |
| Building & outdoor | Elevator · Parking · Balcony · Private yard · Ground floor · Furnished | `#FFE8DC` / `#C24A1F` |

Tiles are the interim treatment until real icons land; the icon then sits in
`ink` on the same `bg`.

**Feature 14 — automatic refetch: cost analysed, still the founder's call.**

Money is not the constraint. Worker invocations are ~$0.30/million and an
indexed `(lat, lng)` bbox query is sub-10ms at any realistic inventory. Two
real costs:

1. **It defeats edge caching.** `/api/listings/price-distribution` is
   edge-cached per filter combination because combos repeat. A bounding box has
   effectively unlimited distinct values — every few pixels of pan is a new key
   — so every refetch becomes a cache miss to origin. **Mitigation: quantise
   the bbox** (round to ~3 dp, or snap to a tile grid) so keys repeat. That is
   a design step, not a config flag.
2. **List churn.** The grid re-renders on every map settle, so cards reorder
   under the cursor mid-pan. More irritating than latency, and the usual
   complaint about map search.

Plus the known sparse-inventory case: small pans return empty grids.

**Recommendation: ship the `Search this area` button.** One deliberate request
at a settled position — cacheable, no churn, no empty-grid surprise. It is what
Airbnb ran for years before inventory justified automatic. Revisit when
Thessaloniki is dense. **Not yet decided.**

### Stale notes cleared

Two items previously marked open are resolved and should not be re-litigated:

- **Feature 38 same-page duplication** — resolved by Feature 47, which cut the
  CTA-side notice to the off-platform warning alone.
- **Feature 49 metric tiles** — resolved by the re-homing table plus the
  2026-08-08 decision to drop `CONVERSION RATE` entirely.
