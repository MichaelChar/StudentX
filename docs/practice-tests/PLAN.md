# StudentX Practice Tests — Implementation Plan

Source of truth for building the AUSoM Semester 2 practice test system at `studentx.uk/student/ausom/semester-2`.

---

## 0. How to use this document

1. Copy this file into the StudentX repo at `docs/practice-tests/PLAN.md` and commit it. Every prompt below tells Claude Code to read it first.
2. Run prompts **P0 → P7 sequentially in one Claude Code instance**, inside the StudentX repo. Run `/clear` between prompts — each prompt is self-contained and re-anchors on this doc.
3. Prompt **S1 (the generation skill)** is independent of the website code. Run it in a separate instance any time, in parallel if you like.
4. Review and commit after every prompt. Do not start the next prompt on top of an unreviewed diff.

### Model and effort per prompt

| Prompt | What it builds | Model | Effort |
|---|---|---|---|
| P0 | Repo recon → CONVENTIONS.md | Opus | medium |
| P1 | Data model, content layout, validation | Opus | medium |
| P2 | Subject page + test list | Opus | medium |
| P3 | Test player | Opus | **high** |
| P4 | Progress persistence | Opus | medium |
| P5 | Report error / propose edit | Opus | medium |
| P6 | Admin review page | Opus | medium |
| P7 | QA pass | Opus | medium |
| S1 | Test-generator skill | Opus | medium |
| — | **Running** the skill on real notes | Strongest available | **high** |

The last row is the one that matters most: generating the actual tests (80/20 judgment, writing non-identical mirror questions) is where model quality shows. Code implementation is well-specified below and does not need it.

---

## 0.5 Amendments after P0 recon (these override sections below)

P0 found the following repo realities; where they conflict with §2–§4, this section wins:

1. **Plain JavaScript, no TypeScript.** All `.ts` references become `.js`. The zod schemas in `src/lib/practice/schema.js` are the canonical data definition (same names and fields as §2.2); JSDoc typedefs accompany them for editor support.
2. **App Router under `src/app/[locale]/…` with next-intl.** All routes in §4 get the `src/app/[locale]/` prefix. Internal links must use the locale-aware next-intl `Link`. UI chrome strings (buttons, labels) go through next-intl messages; test content itself stays English-only JSON.
3. **Deploy target is Cloudflare Workers (OpenNext).** No runtime `fs` reads. Content JSON must be loaded bundler-safe: static imports via a generated manifest module, or build-time reads behind `force-static` + `generateStaticParams`. Validation in `scripts/` runs in Node at build/CI time and may use `fs` freely.
4. **Styling: Tailwind v4 via `globals.css`** (no config file). Match the HubButton "Stripe-modern" family — iris `#635BFF`, ink `#0a2540`, parchment `#f6f4ff`, Inter/Inter Tight, radius 22, soft shadows, 460–480px max-width. Do NOT use the older brutalist `src/components/ui/*` family.
5. **Semester page**: `src/app/[locale]/student/ausom/semester-2/page.js`, hardcoded `SUBJECTS` array rendered via `HubButton` with a `comingSoon` prop — P2 toggles that prop per subject, no restyling.
6. **Supabase**: clients at `src/lib/supabase/{Browser,Server}.js`; service-role helper `getSupabaseAsService` exists; migrations in `supabase/migrations/` with a CI migration-check; admin gating already exists via `requireAdmin` + `ADMIN_EMAILS` — P6 uses it instead of building its own.

## 1. Architecture overview

Three subsystems:

1. **Generate (offline).** A Claude skill takes a folder of class materials (pptx, pdf, docx, images) plus past papers for one subject, performs an 80/20 high-yield analysis, and outputs: N topic tests + 1 mock exam (JSON) + answer-explanation screenshots (PNG). Michael reviews and commits to the repo. No generation code runs in production.
2. **Use (studentx.uk).** Static JSON is rendered by new Next.js pages styled like the rest of the site. Students (guests for now) take tests with instant per-question marking; feedback shows a screenshot from the class notes, falling back to a text explanation. Progress is stored in `localStorage` behind an interface that a Supabase implementation can replace when accounts arrive.
3. **Edit (feedback loop).** Every question has a "Report error / propose edit" button that inserts into a Supabase `question_reports` table (insert-only for anonymous users). An admin page lists reports; Michael applies accepted fixes to the JSON source and recommits — closing the loop back into subsystem 1's output.

Key decisions already made: static JSON in repo (not DB-stored content); offline skill generation (no API keys in prod); instant feedback UX; guests allowed now, accounts later; Supabase (already the site's backend) for reports.

Subjects (slugs): `medical-informatics`, `anatomy-1`, `general-histology`, `biochemistry-1`, `general-physiology`.

---

## 2. Data model

> Paths below assume an `app/` router and a `lib/` folder. **P0 verifies the repo's real conventions; if they differ, CONVENTIONS.md wins and these paths are adapted — names stay the same.**

### 2.1 Content layout

```
content/practice/ausom/semester-2/{subject}/index.json        ← subject index
content/practice/ausom/semester-2/{subject}/{testId}.json     ← one test
public/practice/ausom/semester-2/{subject}/{testId}/{questionId}.png  ← screenshots
```

### 2.2 TypeScript types — `lib/practice/types.ts`

```ts
export type QuestionType = "mcq" | "tf";

export interface Explanation {
  image?: string;      // public path: /practice/ausom/semester-2/...
  imageAlt?: string;   // required if image is set
  caption?: string;    // 1–2 sentence takeaway shown under the image
  source?: string;     // e.g. "Lecture 4 — slide 23"
  text?: string;       // fallback when no image, or extra detail
}

export interface Question {
  id: string;          // stable slug, e.g. "q03"; never renumber after publishing
  type: QuestionType;
  stem: string;
  options: string[];   // 4–5 for mcq; ["True", "False"] for tf
  correct: number;     // index into options
  explanation: Explanation;  // must have image OR text
  topic: string;       // e.g. "upper-limb"
  yield: "high" | "medium";
  pastPaperRef?: string;     // mock exams only, e.g. "2024-Q12"
}

export interface PracticeTest {
  id: string;          // e.g. "upper-limb" or "mock-exam"
  subject: string;     // subject slug
  title: string;
  kind: "topic" | "mock";
  description?: string;
  version: number;     // bump on every edit (feeds the edit loop)
  updatedAt: string;   // ISO date
  questions: Question[];
}

export interface SubjectIndex {
  subject: string;
  title: string;       // display name, e.g. "Anatomy I"
  school: "ausom";
  semester: "semester-2";
  tests: Array<{
    id: string;
    title: string;
    kind: "topic" | "mock";
    questionCount: number;
  }>;
}
```

### 2.3 Loader — `lib/practice/content.ts`

Server-side functions: `getSubjectIndex(subject)`, `getTest(subject, testId)`, `listSubjectsWithContent()`. Read JSON from `content/practice/...` at build/request time (static generation preferred). Unknown subject/test → `null` (pages render 404).

### 2.4 Validation — `scripts/validate-tests.ts`

Zod schemas mirroring the types, plus checks zod can't express:

- every `correct` index is in range for its `options`
- every `explanation` has `image` or `text` (or both); `image` ⇒ `imageAlt`
- every `image` path exists under `public/`
- question `id`s unique within a test; test `id`s unique within a subject; `index.json` agrees with the test files (ids, titles, counts)
- `kind: "mock"` ⇒ every question has `pastPaperRef`; `kind: "topic"` ⇒ none do

Exposed as `npm run validate:tests`. CI-friendly: nonzero exit on failure, human-readable error list.

---

## 3. Supabase — `question_reports`

One migration. Insert-only for anon; reads only server-side (service role) for the admin page.

```sql
create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject text not null,
  test_id text not null,
  question_id text not null,
  test_version int not null,                 -- version the reporter saw
  kind text not null check (kind in ('error', 'edit')),
  message text not null check (char_length(message) between 5 and 2000),
  proposed_change text check (char_length(proposed_change) <= 2000),
  reporter_email text,                       -- optional, for follow-up
  status text not null default 'open'
    check (status in ('open', 'accepted', 'rejected', 'resolved')),
  admin_note text,
  resolved_at timestamptz
);

alter table public.question_reports enable row level security;

create policy "anyone_can_insert" on public.question_reports
  for insert to anon, authenticated with check (true);

-- intentionally NO select/update/delete policies for anon/authenticated:
-- the admin page reads and updates via the service-role key, server-side only.
```

Status lifecycle: `open → accepted | rejected`; `accepted → resolved` once the JSON fix is committed (bump the test's `version`).

---

## 4. Routes and components

| Route | Purpose |
|---|---|
| `/student/ausom/semester-2` | exists; "Soon" badges become links for subjects with content |
| `/student/ausom/semester-2/[subject]` | test list: topic tests + mock exam, question counts, best scores |
| `/student/ausom/semester-2/[subject]/[testId]` | test player |
| `/admin/practice-reports` | admin review page (server-gated) |

Component inventory (names final, locations per CONVENTIONS.md):

- `TestPlayer` — orchestrates one attempt; owns state machine (see P3)
- `QuestionCard` — stem + options; locked after answer
- `FeedbackPanel` — screenshot w/ lightbox, caption, source; or text
- `ScoreSummary` — score, per-topic breakdown, wrong-question review
- `ReportIssueModal` — the edit-loop entry point, on every question
- `ProgressStore` (interface) + `LocalStorageProgressStore`

---

## 5. Generation skill spec (SKILL.md draft)

S1 creates this skill verbatim (adjusting only file-layout boilerplate). Skill name: `generate-practice-test`.

```markdown
---
name: generate-practice-test
description: >
  Generate StudentX practice tests for one AUSoM subject from class materials
  (pptx, pdf, docx, images) and real past papers. Performs 80/20 high-yield
  analysis, builds topic tests + a mock exam mirroring the past paper, and
  renders answer-explanation screenshots. Trigger on: "generate practice test",
  "make tests for <subject>", or any request to turn class notes + past papers
  into StudentX test JSON.
---

# Generate practice test

## Inputs (ask if missing)
1. Subject slug (one of: medical-informatics, anatomy-1, general-histology,
   biochemistry-1, general-physiology)
2. Folder of class materials (pptx/pdf/docx/images)
3. Folder of past papers
4. Path to the StudentX repo (for schema, validation script, output locations)

## Phase 1 — Ingest
- Inventory every file. Convert to analyzable form:
  - pptx → `soffice --headless --convert-to pdf`, keep slide numbering
  - pdf → extract text (pdftotext); OCR pages with no text layer
  - docx → text via pandoc or python-docx
  - images → read directly (vision)
- Build a source map: every chunk of content tagged with
  {file, slide/page number} — needed later for screenshots and `source` fields.

## Phase 2 — 80/20 yield analysis
- Extract a topic list from the materials (lecture titles, section headers).
- For each past-paper question: identify the topic + specific knowledge point
  it tests. Past-paper frequency is the PRIMARY yield signal.
- Secondary signals: repetition across lectures, slide count per topic,
  explicit lecturer emphasis ("important", "exam", bold/starred items).
- Produce a yield table: topic | knowledge points | evidence | yield (high/med/low).
- ⛔ CHECKPOINT: show the yield table and the proposed test split
  (which topic tests, how many questions each) and WAIT for approval.

## Phase 3 — Generate topic tests
- One test per approved topic block, 15–25 MCQs, covering the high-yield
  knowledge points (the "80%"). Skip low-yield material.
- Question rules:
  - single best answer; 4–5 options; exactly one correct
  - distractors must be plausible — drawn from real confusions in the notes
    (adjacent structures, similar enzymes, off-by-one mechanisms)
  - test understanding/application, not slide-wording recall
  - no "all/none of the above", no trick negatives without emphasis
  - true/false sparingly (type "tf"), only for genuinely binary facts
- GOOD: "A patient cannot abduct the arm 15–90°. Which muscle's innervation
  is most likely damaged?" (applies knowledge)
- BAD: "Which slide discussed the deltoid?" (tests the slides, not anatomy)

## Phase 4 — Generate mock exam
- For EVERY past-paper question, write exactly one new question that tests
  the same knowledge point at the same difficulty.
- Never reuse the stem, scenario, numbers, or option wording — the student
  has already done the past paper; this checks transfer of understanding.
- Set `pastPaperRef` (e.g. "2024-Q12"). Same question rules as Phase 3.

## Phase 5 — Screenshots
- For each question, find the slide/page that contains the relevant theory
  (use the Phase 1 source map).
- Render: `pdftoppm -png -r 150 -f <page> -l <page>` on the converted PDF.
  Crop to the relevant region if the page is dense.
- Save to public/practice/ausom/semester-2/{subject}/{testId}/{questionId}.png
- Fill `caption` (the takeaway), `source` ("Lecture 4 — slide 23"),
  `imageAlt`. If no good visual source exists, write `text` (2–4 sentences)
  and omit the image.

## Phase 6 — Validate and hand off
- Write test JSON + index.json per the repo's src/lib/practice/schema.js.
- Run `npm run practice:manifest` (regenerates the static-import manifest —
  required whenever content JSON is added/removed), then
  `npm run validate:tests`; fix every error.
- Output a summary: tests created, question counts, yield coverage,
  questions with text-only explanations (for manual screenshot review).
- Do NOT commit — Michael reviews first.
```

Skill folder also contains `scripts/render_page.sh` (the soffice/pdftoppm pipeline) so the model shells out instead of improvising.

---

## 6. Prompt sequence

Copy-paste each block into Claude Code. `/clear` first. Commit after each.

### P0 — Repo recon (Opus, medium)

```text
Read docs/practice-tests/PLAN.md in full — it is the source of truth for the
practice-test project.

Task: explore this repo (read-only) and write docs/practice-tests/CONVENTIONS.md
documenting, with file paths and code snippets:

1. Framework: Next.js version, app router or pages router, TS config strictness.
2. Styling: Tailwind config / design tokens / CSS approach. Extract the exact
   colors, fonts, spacing, and border radii used by the page at
   /student/ausom/semester-2 and its parent layout — future pages must match.
3. That page itself: file path, how the subject list and "Soon" badges are
   rendered, where the data comes from.
4. Supabase: client setup location(s), env var names, how migrations are
   managed, whether server-side service-role usage exists, auth setup and
   whether any admin concept exists.
5. Reusable UI: existing button/card/modal/badge components worth reusing.
6. Build/deploy: scripts, CI, hosting.

End CONVENTIONS.md with a section "Deviations from PLAN.md" listing anything in
PLAN.md sections 2–4 that conflicts with repo reality (e.g. no content/ dir
convention, different router). Do not modify any existing file. Finish with a
10-line summary in chat.
```

### P1 — Data model, fixture, validation (Opus, medium)

```text
Read docs/practice-tests/PLAN.md (sections 0.5, 2, 4) and
docs/practice-tests/CONVENTIONS.md. Section 0.5 amendments override the rest
of PLAN.md; CONVENTIONS.md wins on file locations; PLAN.md wins on names and
schema shape.

Build the data layer for practice tests. This repo is plain JavaScript — no
TypeScript anywhere:

1. src/lib/practice/schema.js — zod schemas as the canonical definition of
   SubjectIndex, PracticeTest, Question, Explanation, exactly the names and
   fields of PLAN.md §2.2 (zod instead of TS). Add JSDoc typedefs alongside
   for editor completion. Add zod if it isn't already a dependency.
2. src/lib/practice/content.js — getSubjectIndex(subject),
   getTest(subject, testId), listSubjectsWithContent(). IMPORTANT: deploy
   target is Cloudflare Workers via OpenNext — no runtime fs. Load the JSON
   bundler-safe: static imports assembled in a generated manifest module, or
   build-time fs behind force-static + generateStaticParams. Pick the simplest
   approach that works on Workers and document the choice in a comment.
3. Fixture content: content/practice/ausom/semester-2/anatomy-1/ with
   index.json, one topic test (upper-limb.json, 5 questions) and one mock
   (mock-exam.json, 3 questions, each with pastPaperRef). Between them,
   exercise: mcq, tf, image explanation (generate a placeholder PNG into
   public/practice/ausom/semester-2/anatomy-1/...), text-only explanation,
   and both yield values. Mark fixture tests "[FIXTURE]" in their titles.
4. scripts/validate-tests.mjs + npm script "validate:tests" implementing every
   check in PLAN.md §2.4. This script runs in Node (CI/build time) and may use
   fs freely. Human-readable errors, nonzero exit on failure.

Acceptance: npm run validate:tests passes on the fixture; temporarily breaking
a correct index or deleting the placeholder PNG makes it fail with a clear
message; lint passes; the production build passes using the same build path CI
uses (OpenNext/Workers build, not just next build). Show me the validator
output and which JSON-loading approach you chose.
```

### P2 — Subject page + test list (Opus, medium)

```text
Read docs/practice-tests/PLAN.md (sections 0.5, 1, 4) and
docs/practice-tests/CONVENTIONS.md. Section 0.5 overrides the rest of PLAN.md.
Reuse the HubButton (Stripe-modern) component family and the globals.css
tokens — the new pages must be indistinguishable in style from the rest of
studentx.uk.

1. Slug reconciliation: the semester-2 page's hardcoded SUBJECTS array uses
   ids med-informatics, histology, physiology; PLAN §1 uses
   medical-informatics, general-histology, general-physiology. Adopt PLAN's
   slugs as the single source of truth and update the SUBJECTS array ids
   (these subjects are comingSoon badges today, so no public URLs break).
   Before renaming, grep the repo for the old ids and report any other
   usages; if any exist outside that page, stop and ask me.
2. New route src/app/[locale]/student/ausom/semester-2/[subject]/page.js:
   server component using getSubjectIndex(). Header (subject title, back link
   to the semester page using the locale-aware next-intl Link), then a card
   per test: title, kind badge ("Topic test" / "Mock exam"), question count.
   Mock exam visually distinct and listed last. Unknown subject → notFound().
3. Update the existing semester-2 page minimally: subjects that have content
   (listSubjectsWithContent()) render as links to their subject page;
   subjects without content keep the current comingSoon treatment. Do not
   restyle the page.
4. Empty state: subject with index.json but zero tests shows "Tests coming
   soon" in the site's style.
5. UI chrome strings go through next-intl messages per repo convention
   (en.json only — a missing key trips the missing-message synthetic canary).

Acceptance: with the P1 fixture, /student/ausom/semester-2 shows Anatomy I as
a live link and the other four still "Soon"; the anatomy-1 page lists the
topic test and the mock exam (mock last, visually distinct); an unknown
subject 404s; npm run validate:tests, lint, and npm run cf:build all pass;
layout checked at 375px. Show me the list of changed files.
```

### P3 — Test player (Opus, **high**)

```text
Read docs/practice-tests/PLAN.md (sections 1, 2, 4) and
docs/practice-tests/CONVENTIONS.md. This is the core UX — match the site's
look exactly.

Build /student/ausom/semester-2/[subject]/[testId]: server component loads the
test via getTest() (unknown → 404) and hands it to a client TestPlayer.

TestPlayer state machine (one attempt):
- ANSWERING: show QuestionCard — progress ("Question 4 of 20"), topic tag,
  stem, options as large tap targets. Click/tap an option → state ANSWERED.
- ANSWERED: options lock. Chosen-wrong option styled danger, correct option
  styled success (both when wrong; just success when right). FeedbackPanel
  appears below: if explanation.image — the screenshot (max-height ~320px,
  click opens a lightbox at full size), caption underneath, source line in
  muted text; else explanation.text. "Next question" button (or "See results"
  on the last question).
- FINISHED: ScoreSummary — score as X/N and %, per-topic breakdown (topic,
  answered correct/total), list of wrongly answered questions; clicking one
  re-opens it in a read-only review view (chosen + correct + feedback
  visible, no re-answering). "Retry test" restarts with question order AND
  per-question option order shuffled (remap the correct index — never mutate
  the loaded JSON).

Also:
- Keyboard: 1–5 selects an option, Enter advances.
- Question order shuffled per attempt (Fisher-Yates on a copy).
- A thin progress bar reflecting questions answered.
- Leave/refresh mid-test: no persistence yet (P4 adds it) — but structure
  state so an attempt snapshot {testId, version, order, answers[]} is
  serializable.
- Every question screen includes a small "Report an issue" text button —
  non-functional placeholder for P5 (renders, does nothing yet).

Acceptance: full run-through of both fixture tests works; wrong answer shows
both red chosen and green correct; lightbox opens/closes; retry reshuffles and
rescores from zero; review mode is read-only; keyboard path works; 375px
mobile layout clean; build passes.
```

### P4 — Progress persistence (Opus, medium)

```text
Read docs/practice-tests/PLAN.md (sections 1, 4) and
docs/practice-tests/CONVENTIONS.md. Accounts come later — build against an
interface so Supabase can replace localStorage without touching UI code.

1. lib/practice/progress.ts:
   interface ProgressStore {
     getAttempts(subject, testId): Attempt[];
     saveAttempt(attempt: Attempt): void;
     getInProgress(subject, testId): AttemptSnapshot | null;
     saveInProgress(snapshot: AttemptSnapshot): void;
     clearInProgress(subject, testId): void;
   }
   Attempt: {testId, subject, version, startedAt, finishedAt, score, total,
   answers: {questionId, chosen, correct}[]}. AttemptSnapshot: the serializable
   mid-test state from P3. Implement LocalStorageProgressStore (namespaced
   keys, e.g. "sx:practice:v1:..."; corrupt/missing data degrades to empty,
   never throws). Export a getProgressStore() factory returning it.
2. TestPlayer integration: save snapshot after every answer; on mount, if a
   snapshot exists for this test+version, offer "Resume attempt (Q 7 of 20)"
   vs "Start over"; version mismatch discards the snapshot. On finish: save
   Attempt, clear snapshot.
3. Test list page: per test, show best score and attempt count from the store
   (client component reading the store; nothing for never-attempted tests).
4. ScoreSummary: show previous attempts (date, score) for this test.

Acceptance: answer 3 questions, refresh → resume offer restores exactly;
finishing records an attempt visible on the list page and in ScoreSummary;
localStorage disabled (private-mode simulation) still works with no crashes;
build passes.
```

### P5 — Report error / propose edit (Opus, medium)

```text
Read docs/practice-tests/PLAN.md (sections 3, 4) and
docs/practice-tests/CONVENTIONS.md (Supabase section: client location, env
vars, migration workflow).

1. Migration: create the question_reports table EXACTLY as in PLAN.md §3
   (table, checks, RLS, insert-only policies), using this repo's migration
   workflow. Tell me the command to apply it — do not run it against prod.
2. ReportIssueModal (replaces the P3 placeholder on every question, available
   in answering, answered, and review states): kind toggle "Report an error" /
   "Propose an edit"; message textarea (min 5 chars, counter to 2000);
   optional proposed_change textarea shown for 'edit'; optional email field;
   hidden honeypot field — if filled, fake success without inserting.
   Submission inserts {subject, test_id, question_id, test_version, kind,
   message, proposed_change, reporter_email} via the anon client. Success →
   "Thanks — we review every report." Failure → inline retry message; never
   lose the typed text. Disable submit while in flight.
3. No select anywhere client-side — anon key + insert-only RLS is the
   security model. Grep the diff to confirm no .select() on question_reports.

Acceptance: with a local/staging Supabase, submitting both kinds inserts rows
with correct fields; honeypot inserts nothing; empty message blocked
client-side AND by the DB check; build passes.
```

### P6 — Admin review page (Opus, medium)

```text
Read docs/practice-tests/PLAN.md (sections 3, 4) and
docs/practice-tests/CONVENTIONS.md (auth + service-role findings).

1. /admin/practice-reports, server-gated:
   - If CONVENTIONS.md documents an existing admin/auth mechanism, use it.
   - Otherwise: require a signed-in Supabase user whose email is in the
     ADMIN_EMAILS env var (comma-separated), checked server-side. Non-admins
     get 404 (not 403 — don't advertise the route).
2. Data access: server-side only, service-role client (create the helper if
   the repo lacks one; key must never reach the client bundle).
3. UI: table of reports — created_at, subject, test_id, question_id, kind,
   status, message preview. Filters: status (default open) and subject. Row
   expands to full message, proposed_change, reporter_email, test_version,
   admin_note. Actions per row: accept / reject / mark resolved (sets
   resolved_at), editable admin_note. Each row links to
   /student/ausom/semester-2/{subject}/{testId}?review={questionId} — add
   support for that query param to the player: opens that question directly
   in read-only review mode.
4. Server actions (or API routes, per repo convention) for status/note
   updates, gated by the same admin check.

Acceptance: non-admin gets 404; admin sees fixture-era reports from P5
testing; accept → status changes and persists; deep link opens the right
question in review mode; service-role key absent from client bundle (verify
in build output); build passes.
```

### P7 — QA pass (Opus, medium)

```text
Read docs/practice-tests/PLAN.md and docs/practice-tests/CONVENTIONS.md, then
QA the whole practice-test feature:

1. Run npm run validate:tests, lint, and a production build — all must pass.
2. Walk every route in PLAN.md §4 with the fixture: semester page, subject
   page, both tests end-to-end, resume flow, report submission, admin page,
   admin deep link. Fix what breaks.
3. Edge cases: unknown subject, unknown test, subject with no tests, test
   with 1 question, question with text-only explanation, very long option
   text, 375px viewport for every screen.
4. Accessibility: options reachable and answerable by keyboard alone; visible
   focus states; lightbox closes on Escape; images have alts; check color
   contrast of the success/danger option states against the site palette.
5. Dark mode parity if the site supports it; otherwise note that it doesn't.
6. Confirm no console errors during a full test run-through.

Output: docs/practice-tests/QA.md — what was checked, what was fixed, what
remains (with file:line). Keep fixes minimal; no refactors.
```

### S1 — Build the generation skill (Opus, medium — separate instance, any time)

```text
Read docs/practice-tests/PLAN.md, section 5. Create a Claude skill named
generate-practice-test:

1. SKILL.md: exactly the content of PLAN.md §5 (frontmatter + body), adjusted
   only for correct relative script paths.
2. scripts/render_page.sh: takes (input file, page/slide number, output path);
   pptx/docx → pdf via `soffice --headless --convert-to pdf` (cache the
   converted pdf next to the source), then `pdftoppm -png -r 150 -f N -l N`;
   pdf input skips conversion. Validate args, fail loudly with usage text.
3. README.md: one paragraph — how to invoke the skill per subject and what to
   have ready (materials folder, past-papers folder, repo path).

Package the skill folder so I can install it. Do not include any test content.
```

---

## 7. Operating the system (after build)

Per subject: gather materials + past papers into folders → run the skill
(strongest model, high effort) → approve the yield-table checkpoint → review
generated JSON and screenshots → `npm run practice:manifest` →
`npm run validate:tests` → commit → deploy.

Per report batch: open /admin/practice-reports → accept/reject → apply accepted
fixes to the JSON (bump `version`, update `updatedAt`) → validate → commit →
mark resolved.

When accounts ship: implement SupabaseProgressStore against the ProgressStore
interface (one table: attempts), swap the factory, optionally migrate
localStorage attempts on first sign-in.
