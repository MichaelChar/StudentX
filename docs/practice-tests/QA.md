# Practice Tests — QA Pass (P7)

Date: 2026-06-14 · Scope: the full practice-test feature (P1–P6) against the
`anatomy-1` fixture. Method: build/validate/lint gates, a runtime sweep of every
route on a local dev server (`curl`, status + `MISSING_MESSAGE` grep), targeted
runtime tests with throwaway fixtures, and code-level verification of behaviours
that can't be exercised headless (localStorage reload, visual layout). Fixes
were kept minimal — no refactors.

---

## 1. Gates — all pass

| Command | Result |
|---|---|
| `npm run validate:tests` | ✓ pass — 1 subject checked |
| `npm run lint` | ✓ 0 errors (3 pre-existing `no-img-element` warnings in FeedbackPanel/Lightbox + 1 in `cf/worker-entry.mjs`) |
| `npm run cf:build` | ✓ exit 0, Worker bundle written |

Build render modes (from `cf:build` output):
- `/[locale]/student/ausom/semester-2`, `/[subject]`, `/[subject]/[testId]` → `●` SSG via `generateStaticParams` (unknown params fall through to `notFound()`).
- `/[locale]/admin/practice-reports` → `ƒ` **Dynamic** (`export const dynamic = 'force-dynamic'`) ✓ as required.
- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) appears only under `.open-next/server-functions/…`; **zero** references in client `_next/static` chunks — no leak.

## 2. Route walk (runtime, local dev) — all correct

| Route | Status | `MISSING_MESSAGE` | Notes |
|---|---|---|---|
| `/` | 200 | 0 | i18n canary clean |
| `/student/ausom/semester-2` | 200 | 0 | Anatomy I = live link; other 4 = "Soon" (4 `aria-label="Coming soon"`) |
| `…/anatomy-1` | 200 | 0 | Upper Limb (Topic, 5 q) first; Mock Exam (Mock, 3 q) **last & iris-tinted/bordered** (distinct) |
| `…/anatomy-1/upper-limb` | 200 | 0 | full player |
| `…/anatomy-1/mock-exam` | 200 | 0 | full player |
| `…/upper-limb?review=q01` | 200 | 0 | read-only review (no Next, correct option highlighted) |
| `…/semester-2/unknown-subject` | 404 | — | ✓ |
| `…/anatomy-1/unknown-test` | 404 | — | ✓ |
| `/admin/practice-reports` (unauth) | 404 | — | ✓ not advertised (404, not 403) |

Player behaviours verified by code trace against `TestPlayer.js`:
- Wrong answer → chosen option **danger** + correct option **success**; correct answer → success only (`QuestionCard.js:83-112`).
- FeedbackPanel: image + lightbox (`FeedbackPanel.js:74-122`, `Lightbox.js`), text-only fallback and image-first/text-below both handled (`FeedbackPanel.js:74-135`); fixture `q01` exercises image+text, `q02–q05` text-only.
- "Report an issue" opens `ReportIssueModal` (`TestPlayer.js:616-622, 454-462`).
- Retry reshuffles question **and** option order, remaps `correct`, never mutates loaded JSON (`TestPlayer.js:391-399, 59-61, 32-46`).
- Best-score / attempt-count pills render only after attempts exist and return `null` (no error) on first load (`TestCardProgress.js:33`).

## 3. Edge cases

| Case | Result | Evidence |
|---|---|---|
| Subject with `index.json`, zero tests | ✓ "Tests coming soon" | runtime test, throwaway `qa-empty` subject → 200 + empty-state string |
| Single-question test | ✓ no "Next question" — shows "See results" → ScoreSummary; retry works | `TestPlayer.js:624` (`isLast ? seeResults : next`); runtime test, throwaway `qa-single` → 200 |
| 200-char option text | ✓ no overflow | runtime fixture rendered; `overflowWrap:'anywhere'` + `flex:1` + `minWidth:0` (`QuestionCard.js:163`) — wraps/breaks any token. Visual 375px confirmed by CSS, not screenshot (headless) |
| Text-only explanation | ✓ text, no broken `<img>` | image block guarded by `image &&` (`FeedbackPanel.js:74`) |
| Image + text | ✓ image first, text below | `FeedbackPanel.js:74-135`, text `marginTop` when image present |
| Resume flow | ✓ snapshot saved after every answer; banner on re-mount; Continue restores exact attempt + jumps to first unanswered | `TestPlayer.js:343-347, 321-339, 403-413`; `progress.js` store. Cross-reload not exercisable headless — verified by code |
| Version mismatch | ✓ snapshot discarded, fresh start, no crash | mount compares `snapshot.version === test.version`, else `clearInProgress` (`TestPlayer.js:331-335`). `practice:manifest` round-trips a version bump cleanly (verified separately) |
| ReportIssueModal | ✓ message <5 → submit disabled; `kind='edit'` shows `proposed_change`; `kind='error'` hides it | `ReportIssueModal.js:44` (`canSubmit`), `:257` (conditional field). DB check `char_length(message) between 5 and 2000` backs it server-side (`060_question_reports.sql:22`) |

## 4. Accessibility

- **Keyboard run-through** — Tab reaches native `<button>` options; `1–5` select while answering (suppressed inside INPUT/TEXTAREA); Enter advances when answered; Escape closes lightbox (capture-phase listener) and modal. (`TestPlayer.js:430-452`, `Lightbox.js:18-26`, `ReportIssueModal.js:34-41`.)
- **Focus rings** — global `:focus-visible` iris outline in `globals.css:74-81` applies to all native interactive elements. **Fixed:** the report-form inputs set inline `outline:'none'`, which (inline > stylesheet) suppressed that ring — removed.
- **Alt text** — options are text-only (no option images). Explanation images carry `imageAlt`; the validator enforces `image ⇒ imageAlt` and that the file exists under `public/`. Lightbox forwards `alt`.
- **Colour contrast (WCAG AA, 4.5:1 text)** — computed against parchment `#f6f4ff` / white option surfaces:
  - Option text (ink `#0a2540` on tinted success/danger): 13.9 / 13.8 ✓
  - QuestionCard "Correct/Your answer" tags: green 4.87–4.99 ✓, red 5.82–6.04 ✓
  - ScoreSummary all-correct topic green: ≈5.0 ✓
  - FeedbackPanel "Not quite" red pill: 5.18 ✓
  - **FeedbackPanel "Correct" green pill: 4.38 ✗ → Fixed** (see §6).

## 5. i18n

- `/` (and every practice route) contains no `MISSING_MESSAGE:` substring — synthetic canary clean.
- `src/messages/en.json` carries **56** `student.practice.*` keys and **32** `admin.practiceReports.*` keys, covering every `t(...)` call across P1–P6 (player, report modal, subject/test list, admin table). No key referenced in code was missing at runtime.

## 6. Fixes applied (minimal)

1. **`src/components/practice/FeedbackPanel.js:16`** — `SUCCESS.text` `#0f7a3d` → `#0d7038`. The "Correct" status pill (13px, normal-weight) sat at **4.38:1** on its `rgba(22,163,74,0.12)`-over-parchment background — below AA. New green is **5.00:1**, visually near-identical. The QuestionCard tag and ScoreSummary green already cleared 4.5:1, so they were left unchanged.

2. **`src/components/practice/ReportIssueModal.js:373`** — removed inline `outline: 'none'` from the shared input/textarea style. Inline styles override the stylesheet, so it was killing the global `:focus-visible` iris ring on the message / proposed-change / email fields (WCAG 2.4.7 — no visible keyboard focus). The global ring now shows.

Both fixes re-verified: `validate:tests`, `lint` (0 errors), and `cf:build` (exit 0) all still pass.

## 7. Open items

| Severity | Item | Detail |
|---|---|---|
| Low | Option number badge contrast | The `1–5` number on the solid-green correct badge is white on `#16a34a` = **3.30:1** (below 4.5 for text; meets the 3:1 graphic-object bar). The digit is `aria-hidden` and redundant with the option's accessible name, so left as-is to avoid restyling the badge. Red badge (white on `#dc2626`) = 4.83 ✓. |
| Info | Headless verification limits | Long-option no-overflow and per-screen 375px layout were verified by CSS reasoning, not screenshots. Resume-across-reload and version-mismatch-mid-attempt were verified by code inspection (localStorage isn't carried across a `curl` "reload"). All underlying logic is sound; a visual/manual pass in a browser is the only remaining confirmation. |
| Info | Lint `no-img-element` warnings | FeedbackPanel + Lightbox use `<img>` deliberately (static screenshots, no `next/image` on Workers asset path). Pre-existing, non-blocking. |

No console-error or crash path was found during the route sweep.
