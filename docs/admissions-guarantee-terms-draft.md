# Admissions guarantee — terms draft

**Status: draft structure, not publishable.** This is scaffolding for the
`/admissions/terms` page, built from the copy already on `/admissions`. It is
**not legal advice and was not written by a lawyer.** Everything here needs a
solicitor's review before it goes live, because it governs a refund promise
attached to a €3,000 payment.

The live page (`src/app/[locale]/admissions/terms/page.js`) still shows the
placeholder. Once these are finalised, the text moves into the
`admissions.terms` namespace in `src/messages/en.json`.

Wording taken verbatim from the landing page is marked **(your words)**.
Places only you can decide are marked **[DECIDE]**.

---

## The decision everything else hangs on

Your public copy currently states the guarantee with **no conditions at all**:

> "Either we get you into your dream university, or you don't pay." **(your words)**
> "Cost if you don't get into your dream university." **(your words)**

There are only two coherent ways to write terms under that.

**Option A — genuinely unconditional.** No student obligations. If they get no
offer, they pay nothing, full stop — even if they ignored every session, missed
deadlines, or never submitted an application.
*Cost:* you carry all the risk, including bad-faith students. *Benefit:* the
terms are one paragraph, the headline is literally true, and there is nothing
for a complaint to bite on.

**Option B — conditions apply.** Student must attend sessions, meet deadlines,
submit the agreed applications. This is what most guarantee-backed services do,
and it's what your copy said before you cut it.
*Cost:* **the landing page must change.** "Either we get you in, or you don't
pay" with conditions buried in terms is precisely the pattern that draws CAP
Code complaints. The FAQ would need something like "Either we get you into your
dream university, or you don't pay — see the terms for what we need from you."

**You cannot have unconditional headline copy and conditional terms.** Pick one,
then the sections below get filled in accordingly. Sections marked
**[OPTION B ONLY]** disappear entirely if you choose A.

---

## 1. Who this agreement is between

- **[DECIDE]** Legal entity name, registered address, company number.
- **[DECIDE]** Governing law. Non-obvious: the domain is `.uk`, the copy targets
  "UK and European medical schools" **(your words)**, and StudentX operates from
  Thessaloniki. Which country's consumer law governs is a real question, not a
  formality — it determines the refund and cancellation rules you're bound by.
- Contact: `michael@studentx.uk`

## 2. What the programme is

Four stages, from the page **(your words)**:

1. **Diagnostic call** — "You tell us about you and we tell you about us. We'll
   provide medical school options based on what you are looking for. After,
   you'll indicate your dream schools from those choices, and we'll get you in
   there."
2. **Application strategy** — "Which schools, in which order, and why."
3. **Personal statement** — "Structured drafting and review of your statement,
   from first outline to final submission."
4. **Interview preparation** — "Mock MMI and panel interviews with feedback, run
   to the format of the schools that invite you."

Delivery: "Every session is one-to-one. No group webinars, no recorded courses."
**(your words)**

- **[DECIDE]** How many sessions, over what period. A guarantee needs a defined
  end — otherwise "the programme" never finishes and the refund never triggers.
- **[DECIDE]** What happens if the student defers to the next cycle.

## 3. What it costs

"€3,000." **(your words)**

- **[DECIDE]** **When is it paid?** This is the single most important commercial
  question and the page doesn't answer it. Three options, very different:
  - *Paid upfront, refunded on no offer* — you hold the money, refund later.
  - *Paid only on success* — nothing changes hands until an offer arrives.
    Matches "you don't pay" **(your words)** most literally.
  - *Deposit + balance on offer.*
- **[DECIDE]** Instalments?
- **[DECIDE]** Does the €3,000 cover application fees, UCAT/admissions test
  fees, or travel to interviews — or are those the student's own cost? Say so
  explicitly; unstated extras are a common complaint trigger.

## 4. The guarantee

### 4.1 What "your dream university" means

This is the clause the whole guarantee stands on, and your own copy already
contains the mechanism that makes it workable:

> "We'll provide options based on what you are looking for. You'll indicate your
> dream schools from those choices, and we'll get you in there." **(your words)**

That is a **closed list you control** — the student picks from options you
offer, not from any university in Europe. Write it that way explicitly:

- We provide a list of medical school options based on what the student tells us
  they are looking for.
- The student selects their dream school(s) from **that list**.
- The selection is recorded in writing and **[DECIDE]** signed / confirmed by
  email / attached to this agreement, dated before the programme starts.
- The guarantee applies to that recorded list and nothing else.

- **[DECIDE]** How many schools may be selected? One, or several?
- **[DECIDE]** If several — does the guarantee mean an offer from **any one** of
  them, or the **top choice**? These are very different promises. "Any one of
  the schools on your list" is far more defensible.
- **[DECIDE]** Can the list be changed mid-cycle, and does that reset anything?
- **[DECIDE]** Scope: "UK and European medical schools" **(your words)** —
  which countries specifically?

### 4.2 What triggers the refund

- The student receives no offer from **[the recorded list — per 4.1]** for the
  agreed application cycle.
- **[DECIDE]** Does a *rejection after interview* count the same as a rejection
  before? (It should — both are "no offer".)
- **[DECIDE]** Does an offer the student **declines** count as us having
  delivered? (It should, and say so — otherwise a student can decline an offer
  and claim the refund.)
- **[DECIDE]** Does a deferred or conditional offer count as an offer? A
  conditional offer the student then misses the grades for is the awkward case —
  decide now, not when it happens.

### 4.3 What we need from you **[OPTION B ONLY]**

Delete this whole section if you chose Option A.

- **[DECIDE]** Attendance — how many sessions may be missed?
- **[DECIDE]** Deadlines — what happens when one is missed? One warning, then
  the guarantee lapses?
- **[DECIDE]** The student must actually submit the agreed applications.
- **[DECIDE]** Accuracy — grades and predicted results given at the diagnostic
  call must be truthful. A student who misrepresents their grades to get
  accepted onto a guaranteed programme is the clearest fair reason to void it.

### 4.4 How the refund works

- **[DECIDE]** Trigger: automatic on results day, or student must claim?
- **[DECIDE]** Deadline to claim — e.g. 30 days from the final decision.
- **[DECIDE]** How long you have to pay — e.g. 14 days from a valid claim.
- **[DECIDE]** Method: back to the original payment method.
- **[DECIDE]** What evidence you need (the rejection decisions).

## 5. What isn't included

Straight from the page **(your words)**:

> "No. Admissions tutors can tell, and most schools now screen for it. We coach
> you through structure, content and redrafting — the writing is yours."

State plainly that:
- We do not write the personal statement.
- We do not submit applications on the student's behalf. **[DECIDE — confirm
  this is true]**
- We have no influence over admissions decisions and no relationship with the
  schools. *(Worth keeping even though you cut the disclaimer from the landing
  page — in the terms it protects you rather than weakening the pitch.)*

## 6. Who we accept

> "We only work with students we think we can place, and we tell you honestly at
> the diagnostic call if that isn't you." **(your words)**

- The diagnostic call is free and carries no obligation on either side.
- We may decline to take a student on. **[DECIDE]** Do you need to give a
  reason?
- **[DECIDE]** Any hard eligibility floor — minimum grades, cycle timing?

## 7. Cancellation

- **[VERIFY WITH SOLICITOR]** If UK law governs, distance-selling rules give
  consumers a **14-day cancellation right** from contract formation, and you
  generally cannot contract out of it. Greek/EU law has an equivalent. This
  applies regardless of your guarantee and needs to be stated correctly.
- **[DECIDE]** What if the student withdraws mid-programme — pro-rata refund,
  or nothing?
- **[DECIDE]** Can you terminate, and what happens to the fee if you do?

## 8. Housekeeping

- **[DECIDE]** How changes to these terms are made and notified.
- **[DECIDE]** Complaints process before any formal dispute.
- Data protection — link the existing privacy policy. **[DECIDE — confirm one
  exists and covers this]**
- **[DECIDE]** Version and effective date. Terms attached to a refund promise
  should be versioned, so you can prove which version a given student agreed to.

---

## Before this goes live

1. Choose **Option A or B** (top of this document). Everything else follows.
2. If B — update the FAQ and the "0" stat card on `/admissions`, or the page and
   the terms will contradict each other.
3. Fill every **[DECIDE]**.
4. Solicitor review, in the jurisdiction picked in §1.
5. Move the final text into `admissions.terms` in `src/messages/en.json` and
   drop the `robots: { index: false }` from the terms page.
