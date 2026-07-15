---
name: resource-extraction
description: >-
  Extract a study resource from any source and convert it into native StudentX
  content — practice tests, past-paper banks, recall banks, in-app flashcard
  (reveal) decks, downloadable Anki decks, or study notes. Handles Claude
  artifacts (claude.ai/public/artifacts/... links), Anki .apkg decks, notes
  documents (.docx/.pdf/.md), and raw question sets. Use when the founder shares
  a resource (a link, a file on the Desktop, a doc) and wants it added to
  StudentX / the /resources hub. Triggers: "extract this", "convert this into a
  practice test / notes / deck", "add this artifact/deck/doc to StudentX",
  "integrate this resource". To AUTHOR tests from raw class materials instead,
  use generate-practice-test.
---

# Resource extraction & conversion → StudentX

Turn any study resource into native StudentX content. Full reference —
input-type recipes, extraction channels, target schemas, transfer gotchas, git
rules, review checklist — is in
[reference/extraction-and-conversion.md](reference/extraction-and-conversion.md).
**Read it, and the run-memory (below), before starting.**

## Run-memory — read first, update at the end (sparingly)

`memory/` holds hard-won learnings from past runs. **At the START of a run, read
`memory/LEARNINGS.md`** — it will save you from re-discovering the same traps.
**At the END, append ONLY a genuinely new, reusable gotcha** (a new artifact
data-shape, a transfer channel that did/didn't work, a schema quirk). Do NOT log
routine successes or per-resource specifics — that clogs it. One or two bullets
max, dated, only when the next run would benefit. See `memory/README.md`.

## Phases

1. **Identify the input** and map each part to a target shape (reference §"Input
   recipes" + §"Target shapes"). Record subject, course code, semester.
2. **Consult** the founder on anything requiring judgment — subject slug, titles,
   terse descriptions, splits, new scoring modes, how to organise notes. Never
   bake creative copy into a prompt unconfirmed.
3. **Extract → stage.** Get clean data onto disk at
   `docs/practice-tests/_incoming/`. The extraction technique depends on the
   input (reference §"Extraction channels"); the *transfer to disk* is the part
   that bites — read §"Getting data to disk" carefully.
4. **Hand off the port.** Give a cheap coding agent a self-contained prompt
   (templates in `assets/port-prompt-templates.md`) that reads the staged file(s)
   by ABSOLUTE path, writes target JSON in a worktree off `origin/main`,
   regenerates + validates manifests, and opens a PR. **Every port prompt MUST
   carry the INPUT-MISSING guardrail** (assets) — cheap models fabricate
   placeholder content when an input file is absent; the guardrail makes them
   abort instead.
5. **Review + merge.** Diff the PR. `validate`/`build` green ≠ content real —
   verify counts, source badges, and that no content was invented (open a couple
   of questions and compare to the source). Resolve `*.generated.js` conflicts by
   regenerating, never by hand. Squash-merge; verify the subject renders.

## Guardrails

- Branch worktrees off `origin/main` after `git fetch` — never local `main`.
- Give the founder command blocks with NO inline `#` comments (their shell runs them).
- Model tiers: extraction = this agent (needs the browser); content ports = cheap
  tier; infra/feature builds (route changes, notes reader, scoring modes) = Opus.
- Never push to `main`; branch + PR for everything.

## Assets

- `reference/extraction-and-conversion.md` — the full SOP, schemas, and channels.
- `assets/port-prompt-templates.md` — port prompts per resource type, each with the guardrail.
- `memory/` — cross-run learnings (read first, append sparingly).
