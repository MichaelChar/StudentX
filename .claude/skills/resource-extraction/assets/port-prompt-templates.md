# Port-prompt templates

Hand these to a cheap coding agent (Grok/Haiku/Fable) to turn STAGED inputs into
repo content. Fill the `<…>` placeholders. **Every prompt starts with the
worktree setup + the INPUT-MISSING guardrail.** Comment-free (founder's shell).

## Shared header (paste at the top of every port prompt)

```
You are a coding agent. Set up a fresh worktree off the REMOTE main:
  cd /Users/mcg/StudentX
  git fetch origin
  git worktree add ../studentx-<slug> -b feat/<slug> origin/main
  cp .env.local ../studentx-<slug>/.env.local
  ln -s /Users/mcg/StudentX/node_modules ../studentx-<slug>/node_modules
Work only inside /Users/mcg/studentx-<slug>. Never write to /Users/mcg/StudentX or /Users/mcg.

GUARDRAIL — do this FIRST: verify each INPUT file below exists and is readable
(head -c 200 <path>). If ANY is missing or unreadable, STOP and report
"INPUT MISSING — aborting." NEVER generate, fabricate, summarise, or placeholder
any content. Every question, card, and note section must come VERBATIM from the
input files. Do not "improve" or rewrite content.
```

## Meta MCQ / past-paper / recall bank

```
INPUT (read-only, absolute; do not copy/commit): <abs path to staged .json>
  → { <bank>:{ questions:[{id,type,stem,options,answer,explanation,source?}] (N) } }
Questions are already meta-shape — wrap + wire only. READ
content/practice/ausom/semester-6/hygiene-epidemiology/past-papers-2020-2024.json as the template.
Create content/practice/ausom/<sem>/<subject>/<id>.json:
  meta:{ title:"<Title>", course:"<MDxxxx Subject>", semester:"Semester N",
         total_questions:N, mcq_count:N, long_answer_count:0, year:2026,
         behaviour:{ mcq:"Select one option. Answer revealed immediately on selection." } }
  questions: the input questions verbatim (keep `source` for past papers).
Add/extend content/practice/ausom/<sem>/<subject>/index.json (SubjectIndexSchema); past papers get
"resourceType":"past-paper" and "kind":"mock"; recalls "kind":"topic".
```

## In-app reveal (flip-card) deck

```
INPUT: <abs path> → { cards:[{id,topic,front,back,yield?}] (N) }
STANDARD PracticeTestSchema, all type:"reveal" (→ FlashcardPlayer). READ
content/practice/ausom/semester-6/pathophysiology/recall-drills.json as the template.
Create content/practice/ausom/<sem>/<subject>/<id>.json:
  { "id":"<id>","subject":"<subject>","title":"<Title>","kind":"topic",
    "description":"<desc>","version":1,"updatedAt":"<YYYY-MM-DD>",
    "questions":[ { "id":"q001".., "type":"reveal", "stem":<front>,
      "explanation":{ "text":<back> }, "topic":<topic>, "yield":<yield|'high'> } ] }
Add it to index.json (kind:"topic").
```

## Study-notes doc

```
INPUT: <abs path> → { sections:[{id,title,html}] (N) }
READ content/notes/ausom/semester-6/hygiene-epidemiology.json as the template.
Create content/notes/ausom/<sem>/<subject>.json:
  { "subject":"<subject>","title":"<Title>","description":"<desc>",
    "school":"ausom","semester":"<sem>","country":"gr","year":2026,
    "sections":[ the N {id,title,html} from input VERBATIM ] }
(docx source: convert with `npx --yes mammoth in.docx out.html` first; split by heading; clean per reference.)
```

## Downloadable Anki deck

```
Source .apkg on Desktop: "<abs path>"  (quote — may have spaces)
Copy to public/flashcards/<subject>/<id>.apkg (create dir). Size: stat -f%z <copied path>.
READ content/flashcards/general-physiology/index.json as the template. Create/extend
content/flashcards/<subject>/index.json with a decks[] entry:
  { "id":"<id>","title":"<Title>","description":"<desc>","cardCount":<N>,
    "fileSizeBytes":<stat>,"file":"/flashcards/<subject>/<id>.apkg","updated":"<date>","year":2026 }
Subject-index header: subject/title/school:"ausom"/semester/country:"gr"/decks:[…].
```

## Shared footer (every prompt)

```
VERIFY (from the worktree): npm run <needed manifests: practice:manifest / notes:manifest /
  flashcards:manifest> && npm run resources:manifest && npm run <validate:tests / validate:notes /
  validate:flashcards> && npm run test && npm run lint && npm run build
SELF-CHECK: report the exact counts (must match the input) and that no fabricated/placeholder content exists.
FINISH: commit on feat/<slug>, push (git push -u origin feat/<slug>), open a PR to main. Do NOT push to main.
```
