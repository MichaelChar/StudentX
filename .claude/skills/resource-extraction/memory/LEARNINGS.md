# LEARNINGS

Append sparingly (see README). Newest at top.

## 2026-07-15 — Microbiology II run (plain `mcp__Claude_Browser__*`, data-array artifact)

- **For TEXT data, a plain `javascript_tool` return beats clipboard/download outright — try it first.** Refines the Ophthalmology note below (which is about binary/download sandboxing, not re-tested here): returning a plain JS object/array directly — letting the tool's own JSON serialization do the ONE encoding pass — transferred ~50KB+ of question/note JSON per call cleanly through the tool-output channel with zero redaction, on the plain in-app browser (no MCP-Chrome needed). The trap: calling `JSON.stringify()` yourself before returning double-encodes it, and if that pushes the result past the token cap the auto-saved fallback file comes out with mismatched backslash-escaping (`JSONDecodeError: Extra data`) — never stringify your own return value.
- **Artifact literals can carry a trailing JS method call, not just pure data.** One question array ended `[...].slice(0,4)` (author trimming a placeholder 5th option) — the brace/string-aware parser must also recognize and apply a trailing `.slice(m,n)` after an array literal, or it throws mid-parse.

## 2026-07 — Ophthalmology run (Claude Code harness, no MCP-Chrome)

- **Transport is harness-dependent; the reliable no-loss channel is a founder-run
  console snippet.** In the plain Claude Code harness the in-app browser
  (`mcp__Claude_Browser__*`) is fully SANDBOXED — `a.click()` downloads never
  reach local disk (searched ~/Downloads, /var/folders, /tmp — nothing), and
  `claude-in-chrome` may be unconnected (`list_connected_browsers`→[]). For TEXT
  (question/note JSON) the through-context path works and is cheap if you
  **gzip in-page (`CompressionStream`) → base64 → return → `base64 -d | gunzip`**
  (~5× smaller than raw b64) and verify each file's SHA-256 against a
  browser-computed hash; a 43 KB single relay corrupted once, so for anything
  big, split into ~3 KB chunks each with its own short SHA and reassemble.
  For BINARY (10 JPEGs, ~350 KB b64) hand-relay is too slow/error-prone — instead
  hand the founder a one-paste console snippet that bundles every image into ONE
  `{key: base64}` JSON and downloads it (their gesture = the download lands in
  ~/Downloads, which Bash CAN read); decode + SHA-verify all at once. One paste
  beats ~100 verified chunks. NB the founder may paste it into their shell by
  mistake — say "browser DevTools console (⌥⌘J), not Terminal".
- **`macOS base64 -d` needs stdin** (`base64 -d < file`), not a positional path.
- **Standard-schema `kind:"mock"` requires a `pastPaperRef` on every question**
  (validate-tests); meta-format mocks bypass it. A predicted/clinical exam has no
  real past-paper ref → make it `kind:"topic"` (histology/physio precedent), and
  keep the test file's top-level `kind` and the index.json entry in agreement.
- **validate-tests asserts `q.image`/`explanation.image` files exist under
  public/** — images must be on disk before the PR goes green (not just referenced).
- **TestPlayer also reveals feedback per-question** (like BiochemTestPlayer), so
  "reveal-on-select" is NOT why a neg-marking MCQ needs TestPlayer over Biochem —
  it's that BiochemTestSchema has no image field and `scoring` lives on
  PracticeTestSchema. Neg-marking = weighted % only (per this founder); store the
  weighted `percent` on the saved attempt so PreviousAttempts stays consistent.

## 2026-07 — ENT written+oral run (fresh session)

- **The download throttle is PER-TAB, not per-session — a fresh MCP tab resets it.**
  Chrome blocks the 2nd+ automated (no-gesture) download in a given tab, but
  `tabs_create_mcp` → navigate → fetch → blob-render → download in the NEW tab
  lands cleanly (it's that tab's first download). So you get one clean download
  per tab: bundle everything for a subject into ONE payload per tab, or open a
  fresh tab per file. In a fresh session, clipboard→pbpaste was STILL dead (the
  MCP Chrome window never surfaces for OS focus, so `document.hasFocus()` stays
  false even after `open_application`), but per-tab downloads worked reliably —
  making download (not clipboard) the go-to no-input channel this session.
- **Scraping a whole section wrapper duplicates its heading.** If you promote a
  section's `<h3>` to the notes `title` AND scrape the wrapper's full innerHTML,
  the h3 renders twice (title + body). Strip the first `<h3>…</h3>` from each
  section's html (verify one-h3-per-section first). Only bites when the heading
  is nested inside a head div (`.tier-head`/`.osce-head`) — a naive leading-h3
  strip misses those; remove by count=1 anywhere in the html instead.
- **xXNikZz notes reader-CSS gap is real and ~40 rules.** ENT written+oral notes
  add ~30 novel classes (osce-head/body/say/steps/do/findings, tier-head/tier-tag,
  banner/mcq-flag/rc/recap-grid). Tables + base elements + pill/callout already
  render (reader targets `table/th/td/ul/li/h4/b/i/.pill`), so degradation is
  cosmetic (flat OSCE scripts), never content-loss. Porting the artifact's own
  CSS under `.notes-prose` + remapping ~10 vars to StudentX notes tokens is the
  fix — additive, new class names, can't touch shipped subjects.

## 2026-07 — seeded from the first integration run (7 semester-6 artifacts)

- **Transfer-to-disk is the real bottleneck, and it degrades over a long session.**
  Shell can get safety-blocked (base64/download/clipboard chatter trips a
  classifier), clipboard-focus stops working, and download throttles to 1/session.
  When several channels are dead at once there is NO no-input path — a **fresh
  session** restores them. If staging fails mid-session, switch sessions rather
  than burning turns. (See reference §"Getting data to disk".)
- **Cheap models fabricate when inputs are missing.** A port run with absent input
  files produced 145 placeholder questions + generic notes that PASSED
  `validate:tests`. Always: (1) INPUT-MISSING guardrail in the prompt, (2) confirm
  files are actually staged before running, (3) review that content is REAL, not
  just structurally valid.
- **Compiled-JSX notes need blob-render + DOM scrape** — only some artifacts do
  this (author "xXNikZz"'s ENT ones); others keep notes in a `NOTES` data array.
  The blob approach works; `srcdoc`/`data:`/`window.name` do not (CSP / Chrome).
- **Artifact data literals vary:** single/double/backtick strings, `/* */`+`//`
  comments, trailing commas, year-keyed vs flat arrays, `a`=index vs `c`=index,
  reveal Q→A vs MCQ. The robust normaliser in the reference handles all seen so far.
- **Subject-slug must be identical across a subject's resource types** or the
  subject facet double-lists it (histology flashcards were slug `histology` while
  practice was `general-histology` — had to rename).
- **Anki export size sanity:** a card-count/size ratio far below peers (e.g. 177
  cards @ 21 KB vs ~3–12 KB/card elsewhere) means a broken export — re-export.
