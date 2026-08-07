# Accommodation Marketplace — Pivot Spec

Status: **draft for review**. Supersedes the directory model for `/property`.
Reference competitor: [nostus.com](https://nostus.com) (Thessaloniki, ~294 live
listings in this city). Companion research: `nostus-acquisition-strategies.md`.

The pivot: `/property` stops being a curated directory that hands students off
to landlords, and becomes a **booking-and-escrow marketplace** for mid-term
student lets (2–12 months), monetised per booking rather than per landlord
subscription.

---

## 0. Decisions to settle before building

| # | Decision | Resolved | Why it matters |
|---|---|---|---|
| **D1** | Browse gate | ✅ **Full browse, gate at Request-to-Book** | Matches Nostus. Signup is demanded when the student wants a specific room on specific dates, not while they are still deciding whether you are worth an account. `ContactGate` stops being a wall and becomes a booking widget. |
| **D2** | Fee split | ✅ Guest service fee + host commission | Nostus charges **both**: guest pays first month + service fee; host pays **5% of total stay value + taxes**. On a 9-month €450 let that host fee is ~€202 out of a €450 transfer. |
| **D3** | Host commission | ✅ **5%** | Implement as a single constant `HOST_COMMISSION_RATE = 0.05`. Base and VAT treatment: see §D3-notes. |
| **D4** | Escrow release delay | ✅ **1 business day after move-in** (revised 2026-08-07; was T+5) | Nostus: rent held, transferred "within 5 business days of your guest's arrival". Their advertised "24h" is the *complaint* window, not the release delay. Needs a business-day calculator with Greek public holidays. |
| **D5** | Legal entity / VAT | ❌ **Unresolved — blocking for Phase 3** | Holding third-party funds is regulated. See §7. |
| **D6** | Verification badge copy | ✅ Bare **"Verified"** (founder's call) | Registered dissent in §W4. Mitigation: an inline tooltip stating what was checked and when. |
| **D7** | Billing removal timing | ✅ **Early — no paying customers** | Removes the sequencing constraint; deletion moves from Phase 4 to Phase 1. |

### D3-notes — the fee formula, settled

**Host commission = 5% of total stay value, plus 24% VAT on top, deducted from
the first month's rent held in escrow.**

```
totalStayValue   = monthlyRent × durationMonths      (pro-rated for part months)
commissionNet    = totalStayValue × 0.05
commissionGross  = commissionNet × 1.24              (24% Greek VAT)
landlordPayout   = firstMonthRent − commissionGross  (released 1 business day after move-in)
```

Implement as **one pure function**, `src/lib/bookingFees.js`, with
`HOST_COMMISSION_RATE = 0.05` and `VAT_RATE = 0.24` as named constants. Every
surface — reservation table, reservation detail, checkout, payout record —
calls it. Nothing recomputes inline.

Worked against the real Nostus booking in §1.5 (€450/mo, ~4.7 months, €1,987.95):

| | Nostus (observed) | **StudentX** |
|---|---|---|
| Commission | €131.40 | **€123.25** |
| Landlord receives from platform | €318.60 | **€326.75** |

Marginally cheaper than the incumbent on the same booking, with an identical
headline number.

**The worst case a landlord will react to — surface it honestly in the UI.**
Because the fee is levied on the whole stay but collected from one month, the
bite grows with duration:

| Duration | Commission as % of first month | Landlord keeps of first month |
|---|---|---|
| 5 months | 31% | 69% |
| 9 months | 56% | 44% |
| **12 months (max)** | **74.4%** | **25.6%** |

At the 12-month cap the landlord receives roughly a quarter of the first month's
rent. It never goes negative (12 × 6.2% = 74.4% < 100%), but the payout
breakdown must show this arithmetic *before* the host confirms availability —
a landlord discovering it after accepting is a landlord who delists.

**Still open:** the *guest* service fee (D2 assumes one exists; its size is
undecided), and whether VAT reverse-charges for VAT-registered landlords. Both
ride along with D5 and the accountant.

---

## 1. Function comparison

| Function | Nostus | StudentX (old) | StudentX (new) |
|---|---|---|---|
| **Inventory, Thessaloniki** | ~294 | 3 | — (ops, not build) |
| Signup gate | at Request-to-Book | **at Contact** (wall on every listing) | at Request-to-Book |
| Landlord signup friction | name/email/phone/password | name/email/password/photo | + **phone** (needed to schedule video calls) |
| Landlord settings page | full account area | **profile photo only** | payout, notifications, contact, phone |
| Cron triggers | n/a | 4 of 5 cap, manual schedule sync | **1** master tick, registry-driven |
| Listing model | Booked units with calendars | Static directory entries | Booked units with calendars |
| Move-in / move-out search | ✅ date pair | ❌ (`available_from` filter only) | ✅ date pair + duration fit |
| Per-listing availability calendar | ✅ Available / Pending / Booked | ❌ | ✅ same three states |
| Reservation request | ✅ 48h host accept | ❌ (open-ended chat inquiry) | ✅ 48h host accept |
| Payment by student | ✅ Stripe, first month + fee | ❌ | ✅ Stripe, first month + fee |
| Escrow / renter protection | ✅ held, released T+5 business days | ❌ | ✅ held, released **1 business day** |
| Move-in confirmation step | ✅ 24h to report a problem | ❌ | ✅ explicit confirm / report |
| Cancellation policy | ✅ tiered, published | ❌ | ✅ tiered, **encoded as data** |
| Model tenancy contract (EN) | ✅ | ❌ | ✅ generated per booking |
| Deposit / agency fee disclosure | ✅ on listing, paid on arrival | partial (deposit only) | ✅ full cost-of-occupancy block |
| Property verification | ✅ **in-person visit** | ❌ (landlord ID only) | ✅ **video call** (§4) |
| Landlord ID / KYC | ❌ none at signup | ✅ ID doc → admin approval, **paid tier required for badge** | ✅ ID doc → admin approval, **free**, blocking before publish |
| Listing copy curation | ✅ free, at the visit | ❌ | ✅ ops step in existing `pending_listings` pipeline |
| Free photography | ✅ at the visit | ❌ | ❌ (not viable remotely — mitigate with photo standards + min count) |
| Student's university captured | ✅ home + receiving, shown to host | ❌ | ✅ (add to student profile) |
| **Listing ↔ campus distance / commute filter** | ❌ **none** | ✅ built, **0 of 3 listings populated** | ✅ **mandatory + prefilled from coordinates** |
| Guest profile shown to host pre-accept | ✅ age, gender, nationality, languages, bio, funding source | ❌ | ✅ |
| Messaging model | thread per reservation, templated opener | open-ended inquiries, no booking | thread per booking request |
| Host decline requires a reason | ✅ | n/a | ✅ |
| Ad-hoc expenses / discounts on a booking | ✅ | ❌ | later (not Phase 3) |
| Inactivity expiry | ✅ 2 days, rolling | ❌ | ✅ + escalating reminders at 6/24/40h |
| Matching quiz | ❌ | ✅ | ✅ (retained, now filters on dates too) |
| Budget histogram | ❌ | ✅ | ✅ retained |
| In-app messaging | basic + WhatsApp | ✅ realtime threads + digests | ✅ retained, scoped to bookings |
| Sort options | 7 | 3 | 5 (adds availability fit, response time) |
| Compare listings | ✅ | ❌ | ❌ (low value at low inventory) |
| Similar listings | ✅ | ❌ | ✅ |
| House rules (pets/smoking/gender) | ✅ | ❌ | ✅ |
| "Bed in shared room" type | ✅ | ❌ | ✅ |
| Bills included shown on detail | ✅ | ❌ (stored + filterable, never rendered) | ✅ |
| Min duration shown on detail | ✅ | ❌ (stored, never rendered) | ✅ |
| Landlord payout account | ✅ manual IBAN/SWIFT/PayPal/Skrill + Wallet | ❌ | ✅ Stripe Connect |
| Host reservations table (money per booking) | ✅ Receive-from / Receive-at-check-in / Total | ❌ | ✅ copy wholesale |
| Pending-payouts tile | ✅ | ❌ | ✅ |
| Bedrooms / bathrooms captured | ✅ | ❌ | ✅ |
| Agency fee field | ✅ | ❌ | ✅ |
| Video URL on listing | ✅ | ❌ | ✅ |
| Duplicate listing | ✅ | ❌ | ✅ (essential for per-room stock) |
| Listing status ladder | ✅ Published/Draft/Pending/Disabled | ❌ | ✅ |
| Import from portal URL | ❌ | ✅ **spiti.gr / xe.gr** | ✅ promoted to primary entry point |
| ID verification blocks… | nothing (observed "Pending" while live) | the paid badge | **payout only** |
| Landlord subscriptions | ❌ | ✅ `verified` / `verified_pro` | ❌ **deleted** |
| Paid verification badge | ❌ | ✅ SuperLandlord | ❌ **deleted** |
| Photo cap by paid tier | ❌ | ✅ 6 free / unlimited paid | ❌ uniform cap, min 5 enforced |
| Live support channel | ✅ WhatsApp + Freshdesk | ❌ | ✅ WhatsApp link |
| Trade-body / institutional badges | ✅ ESN, Erasmus+ App, STAMA, POMIDA, EYCA | ❌ | ✅ as partnerships land |
| Public review presence | ✅ Trustpilot | ❌ | ✅ post-stay reviews |

---

## 1.5 Nostus host product — observed from inside a live host account

Scoped read-only from the founder's own Nostus host account (4 listings,
49 reservations, Thessaloniki — the *same three properties* also listed on
StudentX). Everything below is observed, not inferred.

### The number that should change your expectations

Reservation filter tabs, with live counts:

| Pending Approval | Pending Payment | Booked | Declined | **Cancelled** |
|---|---|---|---|---|
| 4 | 0 | **2** | 0 | **41** |

**41 of 47 reservations cancelled. 2 booked.** A ~4% request→booked conversion
on the incumbent's polished funnel, with 294 listings and ESN distribution.

Read that before assuming the booking flow is a conversion machine. Requests are
cheap and speculative — students fire them at many listings and abandon, or the
48h payment window lapses. **Design implications, all of which are now in the
plan:** the accept→pay window must auto-expire and auto-release the calendar
hold (W2), landlords must never be left guessing (dashboard counts by state),
and "requests" are a vanity metric — the only number worth reporting is *booked*.

### Host economics, derived from three real bookings

| Guest | Rent/mo | Term | Total reservation | Received from Nostus | Received at check-in |
|---|---|---|---|---|---|
| Noor | €500 | 10 mo | €4,674.36 | **€191.03** | €500 |
| Finja | €450 | ~9.5 mo | €4,024.02 | **€184.02** | €450 |
| Jakub | €450 | ~4.7 mo | €1,987.95 | **€318.60** | €450 |

The deduction is **6.61% of total stay value** in all three cases — a fixed
formula, against an advertised "5% + taxes". "Received at check-in" is the
security deposit, paid direct by the guest.

**The landlord-facing consequence is brutal and is your wedge:** on Noor's
booking the host hands over a €500 first month and receives **€191** — 62% of
the first month consumed by commission, because the fee is levied on the *whole
stay* but collected from *one month*. Longer tenancy = larger bite from the same
single payment. A landlord signing a 10-month let feels this acutely.

**Therefore (revises D3):** price the host side as a **% of first month's rent**,
not of total stay value, and say so plainly. It is simpler, it is obviously
cheaper on long lets — the exact lets student housing is made of — and it is a
one-line pitch against the incumbent.

### Host navigation (their information architecture)

`Dashboard · Profile (Verification / Password / Payment Method / Wallet) ·
My Listings · Add New Listing · Reservations · Messages · Favorites`

- **Dashboard**: three tiles — Listings (4), Reservations (49), **Pending Payouts
  (€375.05) → Wallet** — then an Upcoming Reservations table whose columns *are*
  the host mental model: Status · Guest · Booking Date · Listing · Check-in ·
  Check-out · Monthly Rent · **Receive From Nostus** · **Receive at Check-in** ·
  **Total Reservation** · Details. Every money question answered in one row,
  with tooltips on the three derived amounts. **Copy this table wholesale.**
- **My Listings**: status filter (All / Published / Draft / Pending / Disabled)
  and per-row actions View · Edit · **Duplicate** · Disable · Delete.
  *Duplicate* is essential for multi-room properties (their stock is literally
  "…– Room 1", "…– Room 2") and StudentX has no equivalent.
- **Payment Method**: Invoicing details (name, company, **Tax Identification
  Number**, address, country) + **IBAN / SWIFT / bank name / account holder**,
  plus PayPal and Skrill.

### Two findings that revise this spec

1. **Nostus does not use Stripe Connect.** They collect raw IBAN and pay out
   manually from a Wallet balance, with full invoicing details and a TIN. They
   have taken the money-transmission role onto their own Greek entity. This
   confirms D5 is real and unavoidable — but it also shows the manual path is
   survivable at their scale. **Recommendation stands: use Stripe Connect.**
   Manual IBAN payouts mean you are storing bank details, reconciling by hand,
   and carrying the compliance burden directly. Connect is more work up front
   and much less work per booking.
2. **ID verification does not block listing or receiving bookings.** The
   founder's own Nostus account shows ID status **"Pending"** while running four
   published listings and taking real money. Friction is back-loaded to the
   point of being optional. **This revises W8:** make ID verification blocking
   before **payout**, not before publish. A landlord should be able to list, be
   video-verified and receive requests immediately; they cannot be *paid* until
   ID and payout details clear. That preserves supply velocity and still gates
   the only step where identity actually matters.

### Their add-listing form (single long form, not a wizard)

Fields: title, description, listing type, **bedrooms**, **bathrooms**, size m²,
floor, bills included, monthly rent, **agency fee**, **security deposit**,
**video URL**, 23 amenities, structured address (`listing_address`, `locality`,
`zip`, `country`, **`lat`/`lng`**), **`min_book_months` / `max_book_months`**,
**smoking allowed**, **pets allowed**, **additional rules**.

Three things to take, one to beat:

- **Take: the map pin.** "Drag and drop the pin on map to find exact location"
  populates `lat`/`lng` automatically from a geocoded address. This is precisely
  §3 Step 1, now validated against the incumbent rather than asserted.
- **Take: bedrooms + bathrooms, agency fee, video URL, house rules, min/max
  months.** StudentX has none of these. Bedroom/bathroom counts are on every
  Nostus card and are a primary filter; the agency fee is a real Greek cost the
  student must be told about before booking.
- **Take: their amenity taxonomy.** Theirs is room-centric — Bedsheets, Blanket,
  Pillows, Double Bed, Single Bed, Desk, Office Chair, Wardrobe, Kitchenware.
  StudentX's 18 are flat-centric and miss all of these, which is wrong for a
  market whose dominant unit is a room in a shared apartment.
- **Beat: it is one long ungrouped form.** The §3 wizard with draft-save is
  better than what they ship, not a copy of it.
- **Absent: any campus/university field on the listing.** They capture the
  student's university on the *profile* (see the correction below), but nothing
  ties a listing to a campus.

### Reservation detail — the host's decision screen

Reached by a plain `?reservation_detail=<id>` link. Sections, in order:

1. **Status header** — `Reservation #67897 · PENDING APPROVAL`.
2. **Booking created** — timestamp.
3. **Listing** — name, linked.
4. **Guest Profile** — Name · **Guest Type: Erasmus+ Student** · Age · Gender ·
   Nationality · Languages · **free-text Guest Bio** (one observed guest wrote a
   full pitch letter: *"I am a very reliable, quiet renter…"*).
5. **Contact Details** — deliberately just "Send a message via Nostus". No email,
   no phone. The channel is closed by design until a booking exists.
6. **Academic Info** — **Home University** and **Receiving University**.
7. **Other information** — *"How are you going to pay for your stay?"* →
   `Self-funded/Salary`. A soft affordability signal for the host.
8. **Details** — Move in / Move out / **"Months: 4 and 22 nights"** / smoking /
   pets echoed back.
9. **Payment** — fully itemised, and worth copying verbatim:

   ```
   To collect on check-in        450.00€
     Security deposit            450.00€
   Payout                        318.60€
     "Nostus will process the payout up to 5 business days
      after the reservation's check-in"
     First month's rent          450.00€
     Host Commission fee        -131.40€
     24% VAT included
   ```

10. **Actions** — `Confirm Availability` / `Decline` (with a **required Decline
    Reason**), plus `View Messages` and a Send-Message modal. Also `Extra
    Expense` and `Discount` modals letting the host add ad-hoc line items to a
    reservation before confirming.

Note the commission is stated as **€131.40 incl. 24% VAT** = 6.61% of the
€1,987.95 stay, i.e. a **~5.33% base rate**, slightly above the advertised 5%.

### Why 41 of 47 reservations cancelled — the actual reason

The cancelled reservation carries an explicit **Cancel Reason**:

> *"The reservation request has expired as 2 days have passed since last
> activity."*

So the bulk of that 87% is **not** students changing their minds. It is a
rolling 2-day **inactivity** timer killing threads where someone — usually the
host — did not reply fast enough. The timer resets on activity and applies to
the whole conversation, not just the initial request.

**This is the single most actionable finding in the audit**, and it cuts two ways:

- **It is the incumbent's biggest weakness.** Their funnel is losing ~87% of
  demand to response latency, not to competition.
- **It is a warning aimed directly at you.** StudentX's own dashboard reports an
  average landlord response time of **1 day 10 hours**. Under a 2-day inactivity
  rule that converts almost nothing.

**Therefore, added to the plan:** response-time is not a vanity stat, it is the
conversion mechanism. W2 must ship (a) **one host reminder at 24h** rather than
a silent expiry, (b) response time surfaced to the landlord as a *performance*
number with the booking consequence spelled out, and (c) response time weighted
in search ranking (already proposed in §4 — now justified by data, not taste).

### Guest profile — full parity with Nostus (founder's decision)

Copy the guest profile in full: name, photo, guest type, age (stored as DOB),
**gender**, nationality, languages, bio, home university, receiving
university/faculty, and the funding answer. Contact details stay hidden — the
in-app thread is the only channel until a booking is confirmed.

**Declining requires no reason.** `Confirm availability` / `Decline` are both
one-click; no reason field, no prompt.

The state transition is still written to `booking_events` with actor and
timestamp — that is the audit trail T8 writes for *every* transition, costs
nothing, adds no friction, and is what you would want if a booking is ever
disputed. It is not a reason prompt and the landlord never sees it.

Gender is a required profile field, matching the incumbent. Greek student
listings routinely specify gender preference, so this reflects how the market
already operates; the corresponding listing-side field is in W7's house rules.

### Messaging is bound to reservations — there is no free-form inbox

Every conversation row shows: sender · timestamp · last message · **reservation
status badge** · **reservation ID** · **listing name** · View Conversation.
Filters are From and Sort ASC/DESC. There is no way to message a host without a
reservation, and the student's opening message is templated:

> *"Hello! I am interested in renting your place from 19/09/2026 to 23/06/2027.
> Looking forward to hearing from you!"*

**This validates and sharpens the plan.** StudentX today has the inverse: open
inquiry threads with no booking attached, which is exactly how you arrive at 5
pending inquiries and 0% conversion. In the new model every thread is a child of
a booking request, carries its status badge, and templates the first message
from the chosen dates. The existing realtime chat is reused, not rebuilt — it
just gains a parent.

### Correction: Nostus is not university-blind

Earlier sections of this spec claimed Nostus has "no university awareness at
all". That is **wrong and is corrected here**. They capture **Home University**
and **Receiving University** on the student profile and show both to the host on
the reservation screen.

What they still do **not** have: any link between a *listing* and a campus — no
distance, no commute time, no proximity filter, no campus facet in search. Their
university data is a **trust signal shown to the host after a request**, not a
**discovery tool for the student**.

So the differentiator is narrower than stated but still real, and should be
described precisely: *StudentX ranks and filters listings by commute to your
faculty; Nostus only tells the landlord which university you are attending once
you have already asked to book.* Do not claim they ignore universities — a
landlord who has seen their reservation screen will know better.

### Dual-listing note

The three StudentX listings are the same three properties on Nostus, and
**Plateia Laodigitrias is €600/mo on StudentX and €650/mo on Nostus**. Worth a
deliberate decision rather than drift — price parity is what a student comparing
both tabs will check first.

---

## 2. Workstreams

Each is justified against the pivot; nothing here is included because Nostus
happens to have it.

### W1 — Availability & dates *(foundation)*

**Why.** You cannot sell a specific unit for a specific term without knowing
when it is free. Every other workstream depends on this. It is also the single
most decision-useful fact on a Nostus card ("Available from Mar 15, 2027") and
the one your cards cannot show.

**Build.**
- `listing_availability_blocks(listing_id, start_date, end_date, kind)` where
  `kind ∈ {booked, pending, blackout}`. `pending` rows are written when a host
  accepts and expire with the 48h payment window.
- Keep `listings.available_from`; add `available_to` (nullable = open-ended).
- Widen `min_duration_months` — currently hard-validated to `1 | 5 | 9`
  (`src/app/api/landlord/listings/route.js:24`). Mid-term lets need `2..12`.
- Search: `move_in` + `move_out` params → listings whose free window covers the
  range and whose `min_duration_months ≤ requested span`.
- Detail page: month-grid calendar, three states, matching Nostus's legend.

### W2 — Reservation state machine

**Why.** The state machine *is* the product. Emails, escrow release, calendar
blocking, cancellation refunds and dispute handling all key off it. Building
payments before the states are pinned down guarantees rework.

**States.**
```
requested → accepted → paid → moved_in → released
     ↓          ↓        ↓        ↓
  declined   expired  cancelled  disputed → refunded (partial|full)
```
- Host has **48h** to accept (Nostus's window; short enough to protect the
  student, long enough for a part-time landlord).
- Student then has **48h** to pay. Dates sit `pending` and are unbookable for
  that window — this is what stops double-booking.
- `bookings` table holds the money-relevant record; `booking_events` gives an
  append-only audit trail (needed the first time someone disputes a refund).

Timer jobs required: accept-expiry (48h), pay-expiry (48h), move-in prompt,
escrow-release sweep (1 business day after move-in). All four land in W9's dispatcher
rather than taking new cron triggers.

### W3 — Payments & escrow (Stripe Connect)

**Why.** This is the pivot. It is also the only mechanism that monetises the
student side, which today contributes £0.

**Decision: reuse the existing Stripe architecture, not Connect (for now).**
Founder's call — revisit once there is cashflow. Concretely that means:

- Student pays the platform's own Stripe account (the one already wired in
  `src/lib/stripe.js` + `/api/webhooks/stripe`). Reuse the existing
  checkout-session + webhook plumbing rather than standing up Connect.
- Funds sit in the platform balance; **landlord payout is manual/off-platform**
  at 1 business day after move-in. Faster than Nostus, which pays at T+5 (§1.5) —
  it is survivable at low volume.
- Checkout line items: first month's rent + guest service fee (+ VAT on the
  fee). Deposit and agency fee are **not** collected — paid to the landlord on
  arrival, disclosed on the listing. Keeps you out of deposit-protection duties.
- Release job flips a `payout_due` state and notifies ops; a human sends the
  transfer and marks it paid. Model the payout record now
  (`payouts(booking_id, amount, state, paid_at, reference)`) so the eventual
  Connect migration is a change of executor, not a change of schema.

**Accept these consequences knowingly:**
1. **You are the money transmitter.** Holding a student's rent and paying a
   landlord from your own balance is the regulated activity, and doing it
   manually does not make it less so. D5 stays blocking.
2. **Manual payouts do not scale** and are error-prone in exactly the way that
   destroys trust — a missed transfer is a landlord who never lists again.
   Set a hard trigger to migrate to Connect (suggest: >15 bookings/month).
3. **Do not store IBANs in Supabase.** The project is shared with an unrelated
   app and the anon key reaches more than StudentX's tables. Collect payout
   details out-of-band at payout time (or via Stripe later); a bank-details
   table in that database is a blast radius you do not need.

**KYC.** ID verification gates **payout, not publish** (§1.5 finding 2): a
landlord lists, gets video-verified and takes requests immediately, but is not
paid until ID clears. That is also the point where identity actually matters.

### W4 — Video-call property verification

**Why.** Founder's call: an in-person visit does not scale for a solo operator.

**Build.** `property_verifications(listing_id, method, verified_by, verified_at,
checklist_json, notes)`. Admin queue + scheduling link + a fixed checklist
(rooms match the photos, address confirmed on camera, landlord demonstrates
access, bills/heating confirmed).

**Badge copy — D6.** Founder's decision is a bare **"Verified"**. Registered
dissent, recorded once and not relitigated: a video call verifies the room
exists and matches the photos; it does not verify the building, the neighbours,
or that keys will be handed over. Nostus's identical word is backed by someone
standing in the room. The concrete failure case is a student booking a listing
badged "Verified", finding it misrepresented, and your escrow paying the refund —
the cost lands as real money plus a public review, and "we only did a video
call" reads badly after the fact.

**Required mitigation, since the word stays:** an inline tooltip / info link on
the badge stating exactly what was checked and on what date ("Video-verified by
StudentX on 12 Aug 2026 — room, address and access confirmed on camera"). This
keeps the badge strong and the claim accurate, and it is what you would want on
record if a booking goes wrong.

### W5 — Cancellation, guarantee, contract

**Why.** The promise is Nostus's single biggest conversion lever, and an
*unencoded* promise becomes a manual support queue the moment volume arrives.

**Build.**
- Cancellation tiers as data, not prose: free ≥60 days before move-in, 50%
  ≥30 days, 0% inside 30 days. Service-fee refundability is a D2/D3 decision.
- Renter guarantee rendered on the listing page **next to the CTA** and again at
  checkout — not buried in T&Cs.
- Generated EN model tenancy contract per booking, attached to both parties'
  confirmation emails. Reuse the inlined-HTML email pattern in `src/lib/*Email.js`.

### W6 — Move-in confirmation

**Why.** This is the mechanism that makes the guarantee real and gates the
escrow release. Without it, "we hold your money until you're happy" is a
marketing claim with no code behind it.

**Build.** On the move-in date the student gets an email + in-app prompt:
*"Everything as promised?"* → **Confirm** (release immediately) or **Report a
problem** (freeze the transfer, open an ops ticket, start the remedy clock).
Silence for 24h after arrival = implicit confirmation, release proceeds at T+1 business day.

### W7 — Listing quality & the Tier-2 fixes

**Why.** Cheapest conversion work available, and most of the machinery exists.

- **`university_distances` mandatory** — at least the two nearest. But **prefill
  from `lat`/`lng`** (you already run OSRM-backed `faculty_distances` and a
  `recompute-distances` cron) and let the landlord adjust. Store `source`
  (`landlord` | `computed`). *Mandatory + typed from scratch = abandonment;
  mandatory + prefilled = data on every listing.* This is your one genuine
  differentiator over Nostus, who have no university awareness at all — and it
  is currently populated on **0 of 3** live listings.
- Render `bills_included`, `min_duration_months`, `sqm`, `floor` on the detail
  page, plus a **total cost of occupancy** block: rent + bills + deposit +
  service fee + agency fee, for the requested duration.
- House rules: pets, smoking, gender preference, max occupants. (Half the
  Nostus Thessaloniki stock specifies gender preference — it is a real search
  criterion here, and needs a discrimination-policy position before shipping.)
- New property type: **bed in shared room** — the cheapest tier and the one
  incoming Erasmus students actually search for.
- Similar listings on the detail page. *More* valuable at low inventory, not
  less: it stops a dead end being a dead end.
- WhatsApp support link. Costs nothing; it is what Greek landlords expect.

### W8 — Landlord upload rebuild

See §3.

### W9 — Cron consolidation (fix the Cloudflare cap)

**Why now.** The marketplace needs four new timer jobs. `wrangler.jsonc` uses
**4 of the 5** triggers Cloudflare Free allows, and the 6th is *silently*
rejected at registration (API error 10072 — this already cost 3 days of a
silently-dropped digest, see PR #150). Adding booking timers on the current
architecture either breaks or leaves zero headroom.

**The cheap answer first, honestly:** Workers Paid is **$5/month** and raises the
cap to 250 triggers. If trigger count were the only problem, that is the whole
fix and the refactor below is optional. Pay it regardless — it removes a cap
that is currently shaping your architecture for no good reason.

**But do the refactor too, because the cap is not the only problem.** The deploy
pipeline does *not* sync trigger changes (`docs/runbooks/cron-schedule-sync.md`):
every edit to `triggers.crons` needs a manual re-PUT to the CF API and a drift
check, which is exactly the kind of step that gets skipped.

**Build — single master tick.**
- One trigger: `*/5 * * * *`.
- One route `/api/cron/tick` holding a job registry: each job declares its own
  cadence (`every: '5m' | '15m' | 'daily@09:15'`), and the route runs whatever
  is due against the wall clock (`getUTCDay()` / `getUTCMinutes()`).
- Jobs run via `Promise.allSettled` with a per-job timeout, inside the existing
  25s `AbortSignal.timeout` budget, keeping `ctx.waitUntil()`.
- Migrate all four existing jobs in, then **merge the two message digests** —
  landlord and student digests are the same job for different audiences and do
  not need separate triggers or the 2-minute offset.

**Payoff:** adding a cron becomes a one-line registry entry with no
`wrangler.jsonc` edit, no manual schedule sync, and no cap to count against.

**Risk to accept:** one trigger means one blast radius — a job that throws must
not take the tick down (hence `allSettled`), and the 25s ceiling is now shared.
Log per-job outcomes so a silent failure is visible; the synthetic canary should
assert the tick ran.

---

## 3. Landlord UI — upload & onboarding

### What Nostus does, and the lesson

Their host registration form is **username, email, phone, password, T&C**. That
is all. No KYC, no documents, no property questions. Friction is deliberately
**back-loaded**: you register in 20 seconds, and the real work (verification
visit, payout details) happens once you are already invested.

StudentX front-loads the opposite way: ID document upload *and* a paid
subscription before the badge does anything. Their funnel is 4 legible steps —
List free → Get verified → Receive bookings → Only get charged when you rent
out — with the money question answered before it is asked.

### Full landlord surface audit (from source)

Nav is `LandlordShell.js:22` — six items:

Live account state at time of audit: 3 listings, 5 pending inquiries, 15 views
this month, **0% conversion**, avg response time **1d 10h**.

| Surface | State | Verdict |
|---|---|---|
| **Dashboard** (536 ln) | 5 stat tiles (listings, pending inquiries, 30-day views, conversion %, response time) + listings widget + inquiries widget + verification widget | Genuinely good. Two live bugs: the greeting renders **"Good to see you,"** with no name, and inquiry rows don't say which listing they concern. Tiles become booking-aware and gain **Pending payouts** (Nostus's third tile). |
| **Listings** (245 ln) | List → view / edit / delete, SuperLandlord pill, add CTA | Needs: status ladder per listing, availability at a glance, and the SuperLandlord pill removed with the paid tier. |
| **Inquiries** (136 ln) | Flat list → per-inquiry chat (141 ln) | Chat is fine and stays. But it is currently the *only* landlord↔student channel; it must become subordinate to bookings, not the primary flow. |
| **Verification** (247 ln) | ID document upload → admin approval. **Bug:** renders the upload form even for an already-verified account, which the API rejects with a 400 | Keep, make free, **block payout not publish** (§1.5 finding 2). Add video-call scheduling and a real status display. |
| **Billing / get-verified** (216 ln) | Paid tiers | **Delete** (D7). |
| **Settings** (27 ln) | **Profile photo. That is all.** | Effectively empty — and there is nowhere to put payout onboarding, notification prefs, or contact details. Needs a real build. |

**Two gaps that bite the pivot directly:**

1. **`landlords` has no phone number.** Nostus collects it at registration.
   You are about to run *video calls* to verify properties — you need a phone
   or WhatsApp number to schedule them, and you are not capturing one. Add to
   signup and to Settings.
2. **Settings is a 27-line stub.** Stripe Connect onboarding, notification
   preferences, contact info and the WhatsApp number all need a home. Build the
   page properly rather than bolting payout onboarding onto the dashboard.

### Current form — problems (verified live, signed in)

`src/components/ListingForm.js`, 940 lines, single page, all fields at once.

1. **Latitude and longitude are typed by hand, and are *optional*.** The help
   text reads: *"Optional — helps students find your property on the map. Find
   coordinates on Google Maps by right-clicking your property."* Asking a
   landlord to right-click in Google Maps and transcribe two decimals is the
   worst interaction in the product, and because it is optional a listing can
   exist with no coordinates — no map pin, no computed commute. Nostus solved
   this with a draggable map pin (§1.5).
2. **University distances are optional**, manual, in metres, with no prefill —
   hence 0/3 adoption. Founder decision: **mandatory**, prefilled from the pin.
3. **Neighbourhood is free text** (`e.g. Toumba`). `/api/neighborhoods` derives
   the results facet from stored values, so one typo becomes a permanent facet.
   Must become a controlled select.
4. **Minimum duration is an enum of 1 / 5 / 9 months only**, enforced server-side
   at `src/app/api/landlord/listings/route.js:24`. Nostus uses a min/max month
   range. Widen to `2..12` + add a maximum.
5. No draft state: abandon the form and everything is lost.
6. Photo cap of 6 is a paywall artefact; dies with the paid tier.
7. No availability input at all, no bedrooms/bathrooms, no agency fee, no house
   rules, no video URL.
8. **Property type list contains `2-Bedroom (x2)`** — a data artefact leaking
   into a public dropdown. Also missing "Entire place" and "Bed in shared room".
9. **`Ground floor` exists as an amenity *and* as a value in the Floor select** —
   two sources for one fact, and the results page already filters on floor.

### The URL importer is dead — verified, not assumed

`/add-listing` carries an **"Import from spiti.gr or xe.gr"** field
(`src/app/api/landlord/listings/import-url/route.js` → `src/lib/importers/`).
It has **no test coverage**, and both sources were probed live on 2026-07-31:

| Source | Result | Fixable? |
|---|---|---|
| **spiti.gr** | **The site no longer exists.** `www.spiti.gr` serves a Parallels *"Domain Default page — the website is not available"*, behind a certificate issued for `*.papaki.gr` (their host's default) that **expired 3 Feb 2023**. | **No.** Nothing to import from. |
| **xe.gr** | Returns an anti-bot **"Human Verification"** interstitial (HTTP 405) to every programmatic request, identical under a bot UA and a Chrome UA. | **Not by us.** Getting past it means defeating bot detection — off the table on both ethics and their ToS. |

So the feature fails 100% of the time. It degrades gracefully (the importer has a
dedicated `CERT_HAS_EXPIRED` branch and a non-OK branch, both returning
"you can still fill in the form manually"), but the UI advertises a capability
that cannot work, on the first thing a landlord sees.

**Do not elevate it — replace it.** Three options, best first:

1. **Paste-the-text importer.** Landlord pastes the listing *description* from
   anywhere — xe.gr, a Facebook group, an email, a PDF — and it is parsed into
   wizard fields. Source-agnostic, immune to site redesigns and bot walls, no
   ToS exposure, and it reaches **Facebook groups**, which is where a large share
   of Thessaloniki student housing actually circulates. This is the version
   worth building.
2. **Partner/API access to xe.gr** — ask rather than scrape. Slow, uncertain.
3. **Remove the field.** The correct interim step regardless: a permanently
   failing importer on the first screen of the landlord funnel is worse than no
   importer.

**Interim action (Phase 1):** remove or feature-flag the URL field and delete the
dead-source copy. **Phase 2:** ship the paste-text importer as wizard Step 0.

### New: 7-step wizard, draft-saved at every step

**Step 0 · Import** — paste a spiti.gr / xe.gr URL to pre-fill steps 1–4, or
"start from scratch". Turns the wizard from authoring into confirming.

| Step | Fields | Justification |
|---|---|---|
| 1 · Address | Geocoded address search + **draggable map pin** → auto `lat`/`lng`, structured `locality`/`zip`, neighbourhood from a **controlled list** | Removes the worst interaction in the product and the free-text facet drift. Validated: Nostus ships exactly this. |
| 2 · Property | Type (incl. entire place, bed-in-shared-room), **bedrooms**, **bathrooms**, sqm, floor, house rules (smoking, pets, additional rules) | Physical facts in one pass. Bedrooms/bathrooms are primary filters on every competitor card and StudentX captures neither. |
| 3 · Universities & commute | Prefilled distances from step 1, **≥2 required**, adjustable, `source` recorded | Contextual — the pin was just placed, so numbers read as derived, not demanded. The one field Nostus has no answer to. |
| 4 · Price & terms | Rent, bills included, deposit, **agency fee**, min **and max** months (2–12) | Money in one place, matching the student-facing cost block. Agency fee is a real Greek cost the student must see pre-booking. |
| 5 · Availability | `available_from`, `available_to`, blackout ranges | Meaningless before terms are set; must follow step 4. |
| 6 · Photos & video | Min 5 enforced, drag-reorder, uniform cap, optional **video URL** | Min-count replaces the paid cap and is the only remote lever on quality, since you cannot send a photographer. Video doubles as verification-call prep. |
| 7 · Review & submit | Preview as students see it → submit for verification | Mirrors the existing `ListingPreview`; sets expectation for the video call. |

**Per-listing actions** (from `My Listings`, matching Nostus): View · Edit ·
**Duplicate** · Disable · Delete, with a status filter. Duplicate is not
optional — the dominant unit here is "…– Room 1 / Room 2" in one apartment, and
without it a landlord re-types the whole wizard per room.

**Status ladder, always visible** — the Nostus lesson applied:
`Draft → ID check → Video call → Copy curation → Live`.
Landlords abandon when they cannot see how far from "live" they are.

**Payout onboarding** (Stripe Connect) sits outside the wizard, blocking only
`accept booking` — so a landlord can list and be verified before ever thinking
about bank details. Back-loaded, like Nostus.

---

## 4. What gets deleted

Removing paid verification touches **22 files** referencing
`verified_tier` / `is_featured` / `is_superlandlord`, and **15** referencing
billing.

**Delete:** `subscription_plans`, `/api/landlord/billing/*` (checkout, plans,
portal, subscription), `BillingSection.js`, the `get-verified` page, the
subscription branch of the Stripe webhook, tier-gated photo limits.

**Keep:** `verification_requests` + ID upload + admin approval — now free and
**blocking before publish** rather than optional and paid.

**Replace:** SuperLandlord ranking priority disappears with the paid tier, so
default sort needs rebuilding. Proposal: availability fit → video-verified →
listing completeness → landlord response time (already computed at
`/api/landlord/response-time`). Ranking should reward the signals that predict a
good booking, and you already collect all of them.

**Timing (D7): do it first, not last.** There are no paying landlords, so there
is no revenue gap and no reason to carry the dead tier through the rebuild.
Deleting it in Phase 1 means W7/W8 are built against the final permissions model
instead of being written twice.

---

## 5. Distribution (from `nostus-acquisition-strategies.md`)

The research doc's UK recommendations do not apply — StudentX is in
Thessaloniki, the same city as Nostus. What transfers:

- **Institutional pipeline is the whole game.** Nostus is national ESN Greece
  housing partner and sits inside the Erasmus+ App. You cannot take those, but
  ESN sections have local latitude and you are local: AUTh / UoM international
  offices, incoming-Erasmus welcome weeks, faculty groups.
- **Your unfair advantage is the funnel you already own.** `/student/ausom`,
  `/resources` and `/gigs` already hold Thessaloniki students. Nostus has to
  rent its audience through ESN; you can put housing in front of yours for free.
  This is the one channel they cannot copy.
- **Landlord wedge: undercut the 5%.** Free listing, free copy curation, video
  verification, and a lower host fee than the incumbent, payable only on success.
- **Time promotions to intake** — Nostus ran "50% off service fee" in July/August.

---

## 6. Sequencing

| Phase | Contents | Gate to next |
|---|---|---|
| **0** | Supply. Nothing below matters at 3 listings. | ≥30 listings |
| **1** | §4 delete billing + paid tier (D7) · **W9** cron consolidation · **D1** ungate browse | Clean permissions model, cron headroom |
| **2** | **W1** dates/availability · **W7** quality fixes · **W8** landlord wizard | Listings carry real availability + mandatory distances |
| **3** | **W2** state machine · **W6** move-in confirm — *no money yet*: "request to book" ends in a confirmed booking, paid offline | State machine exercised on real bookings |
| **4** | **W3** Stripe Connect + escrow · **W5** policy & contract | First paid booking released |
| **5** | **W4** video verification at scale · reviews · similar listings | — |

Phase 1 first because everything downstream is written against the permissions
and cron model it establishes. Phase 3 before Phase 4 is deliberate: run the
whole booking flow with real landlords and students before regulated money
movement is involved.

---

## 7. Risks

1. **Escrow is regulated.** Holding and disbursing third-party funds is money
   transmission. Stripe Connect is the compliant path; Greek VAT on the
   commission and a rewritten T&C are prerequisites, not follow-ups. This is
   the largest non-engineering item in the plan.
2. ~~Revenue gap~~ — retired by D7; no paying landlords exist.
3. **Supply** — unchanged from the previous analysis and still the binding
   constraint. 3 vs 294.
4. **Cron cap of 5** — addressed by W9. Pay the $5/mo regardless.
5. **Migration numbering** — prod has drift; number off prod's highest *applied*
   migration (`mcp__supabase__list_migrations`), not the repo's `068`. Apply to
   prod before merging the consuming PR.
6. **Trust asymmetry.** Nostus has in-person verification, ESN, STAMA, POMIDA,
   EYCA and Trustpilot. You will have video calls and escrow. Compete on the
   escrow and the commute data; do not imply a verification depth you do not have.
