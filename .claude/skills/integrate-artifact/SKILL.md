---
name: integrate-artifact
description: >-
  Integrate a community-made Claude artifact (a self-contained HTML study tool,
  e.g. a claude.ai/public/artifacts/... link) into StudentX as native resources —
  practice tests, past-paper banks, recall banks, in-app flashcards, or study
  notes. Use when the founder shares an artifact URL and wants it turned into
  StudentX content, or says "integrate this artifact", "port this artifact",
  "upload this as a practice test / notes", or "add this study tool to the
  resources hub". This PORTS pre-authored artifact content; to AUTHOR tests from
  raw class materials, use the generate-practice-test skill instead.
---

# Integrate a Claude artifact into StudentX

Turn a community artifact into native StudentX resources that match the existing
histology/physiology/biochemistry content. Full reference — schema shapes,
extraction channel, decision defaults, git rules — is in
[reference/artifact-integration.md](reference/artifact-integration.md). **Read it
before starting.**

## Capability check first

Extraction requires a **browser MCP with the user's authenticated claude.ai
session** — the artifact API is Cloudflare-protected, so `curl` and browserless
agents (Grok CLI) get a 403. If you lack a browser MCP, you can still do the
scope/consult/port/review phases from a staged input file, but you cannot extract.
Say so up front rather than failing at fetch time.

## Phases

1. **Scope.** Open the artifact, read its data arrays, and map each section to one
   of the five shapes (see the reference table): practice test, past-paper bank,
   recall bank, in-app flashcards, study notes. Record subject, course code, semester.

2. **Consult.** Propose the subject slug, per-resource titles, and terse
   descriptions; surface every creative/structural decision (subject splits,
   ambiguous-question handling, any new mode like negative marking) and get the
   founder's sign-off. Never bake creative copy into a prompt unconfirmed.

3. **Extract** (browser step). Fetch `/api/published_artifacts/<id>`, parse the
   script literals (key-quote → JSON.parse; backtick→JSON preprocessor for notes
   HTML), transform to the target shape, and stage clean JSON to
   `docs/practice-tests/_incoming/`. Move it to disk via **clipboard →
   `LC_ALL=en_US.UTF-8 pbpaste`** — never tool-return (redactor blocks it) or
   download (throttled). Validate counts + byte size on disk. Full channel + traps:
   reference §"Extraction channel".

4. **Port.** Hand a self-contained prompt (see `assets/port-prompt.md`) to a cheap
   coding agent. It must: branch a worktree off `origin/main` (never local main),
   read the staged file by **absolute path**, write the target JSON in the worktree,
   regenerate + validate manifests, and open a PR. For study notes, the notes-reader
   surface must exist first (see `assets/notes-prompt.md`); it's an Opus-tier build.

5. **Review + merge.** Diff the PR — cheap-model "build passed" ≠ correct. Check
   counts, ambiguous edits, that imports resolve, and that no shared component was
   over-edited. Resolve `*.generated.js` conflicts by **regenerating**, never by
   hand. Squash-merge, then verify the subject renders end-to-end.

## Guardrails

- Branch off `origin/main` after `git fetch`; a stale local `main` ships pre-refactor
  code that only fails in CI.
- Give the founder command blocks with **no inline `#` comments** (their shell runs them).
- Model tiers: extraction → browser agent; content ports → cheap tier; infra/feature
  builds (route changes, notes reader, scoring modes) → Opus/high.
- Never push to `main`; branch + PR for everything.

## Assets

- `reference/artifact-integration.md` — the full SOP and schema reference.
- `assets/port-prompt.md` — template for a content-port prompt (practice/past-paper/recall).
- `assets/notes-prompt.md` — template for the study-notes port (+ the one-time notes-reader build).
