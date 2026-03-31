# Agent Build Plan — Student Directory

3 agents working in parallel. Dependencies are marked with ⏳ (blocked until prerequisite completes).

---

## Agent Roles

| Agent | Owns | Key Output |
|-------|------|------------|
| **A — Data Layer** | Schema, ingestion pipeline, normalization, distance precomputation | Database/storage, ingestion scripts, clean seed data |
| **B — Backend/API** | Server, API routes, filtering/sorting logic, query layer | Working API that the frontend consumes |
| **C — Frontend/UI** | Quiz, results view, detail view, layout, navigation | User-facing app |

---

## Phase 1 — Foundation (all parallel, no dependencies)

| Agent A — Data | Agent B — Backend | Agent C — Frontend |
|---|---|---|
| Define star schema as concrete tables/models | Scaffold server/API project, define route contracts and response shapes | Scaffold frontend project, set up routing, layout shell (nav, footer) |
| Create faculty reference dataset (all Thessaloniki university faculties with coordinates) | Stub all endpoints with mock data matching schema | Build quiz component (faculty select, budget, type, duration, dealbreakers) |
| Build sample seed data (5–10 fake listings) matching schema | | |

**Shared contract:** A defines the schema. B and C agree on API response shapes. All three reference `context/data-architecture.md` as source of truth.

---

## Phase 2 — Core Logic (some dependencies)

| Agent A — Data | Agent B — Backend | Agent C — Frontend |
|---|---|---|
| Build ingestion script (batch CSV/JSON → normalized records) | ⏳ Implement filtering logic using schema from A (budget, type, amenities inverse filter) | Build results list view (sortable columns, faculty distance display) |
| Build normalization pipeline (standardize fields, flag missing dimensions) | ⏳ Implement sorting (ascending/descending on any dimension) | Build listing detail view (photo gallery, all dimensions, description) |
| Build distance precomputation (listing coords → walk/transit time to each faculty) | Implement search/query endpoint | Wire quiz selections into URL params or state for API call |

**Dependencies:** B needs A's finalized schema to implement real filtering. C can build against B's mock endpoints from Phase 1.

---

## Phase 3 — Integration (sequential dependencies)

| Agent A — Data | Agent B — Backend | Agent C — Frontend |
|---|---|---|
| Load real seed data through the ingestion pipeline | ⏳ Connect API to real data store (replacing mocks) | ⏳ Connect UI to live API (replacing stubs) |
| Validate: every listing has all dimensions filled | ⏳ Validate: filters return correct results against real data | ⏳ Validate: quiz → results → detail flow works end-to-end |
| Export final data snapshot | | |

**Dependencies:** B waits for A's real data. C waits for B's live API.

---

## Phase 4 — Polish (all parallel)

| Agent A — Data | Agent B — Backend | Agent C — Frontend |
|---|---|---|
| Document ingestion process for future data updates | API error handling, edge cases | Responsive testing (375px, 768px, 1280px) |
| Build "add new batch" workflow for ongoing maintenance | Performance (query speed with full dataset) | Accessibility, contrast, font loading |
| | | Final build check (`npm run build` zero errors) |

---

## How to Use This Plan

When Michael is ready for a phase, I generate 3 prompts — one per agent. Each prompt includes:
1. The full relevant context (schema, contracts, architecture doc)
2. Exactly what to build in that phase
3. File/folder boundaries so agents don't conflict
4. What to output so the next phase can pick it up
