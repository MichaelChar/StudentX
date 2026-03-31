# MEMORY

What I've learned working with Michael. This file stays current — outdated info gets replaced, not appended.

---

## Voice
- **Web copy tone:** Professional but approachable. Confident, not pushy. Feature-first — describe what's available, let the reader decide.
- **Headlines/taglines:** Declarative fragments over full sentences. One sentence max in hero sections. ("Your home in Miami." not "We help you find your dream home...")
- **CTAs:** Soft and understated — "View listings", "Learn more", "Get in touch". Never aggressive ("BUY NOW", "ACT FAST").
- **No exclamation marks in CTAs.** No false urgency. No sales pressure language.

---

## Process
- **Task routine:** Always read all files in `context/` first (foundation), then read `MEMORY.md` (learned preferences), then use both to shape the task.
- When something is learned or corrected, update the relevant section here in place.
- **Infer first, ask second** — use available context to make decisions before asking Michael. Only ask when genuinely ambiguous.
- **Full regeneration over patches** — when Michael gives feedback, rebuild incorporating all notes rather than patching individual elements.
- **Preserve all drafts** — never delete or overwrite a previous version. Every iteration gets saved.
- **No revision cap** — iterate until Michael approves.
- **Show creative rationale** — when presenting a design, include 2-3 sentences on key decisions and how they connect to the brief.

---

## People
- **Michael Charles** — runs StudioX, a design company. One division builds websites for real estate agents.

---

## Projects
- **Student Directory** — student housing directory for Thessaloniki. Curated by Michael (not open marketplace). Data sources: Michael's existing landlord/company list + scraped data he'll upload. My role: clean/enrich data, generate the directory site, maintain and update it over time. Data architecture defined — see `context/data-architecture.md`. Currently: ready for implementation planning.

---

## Output
- **Design philosophy:** Bauhaus-inspired — form follows function, geometric clarity, reduction to essentials. Content is the hero.
- **Visual style:** Apple-influenced minimalism. Bold typography, high contrast, generous whitespace, cinematic imagery.
- **Color defaults (real estate):** Navy `#1B2A4A`, Gold `#C4953A`, White `#FFFFFF`, Dark gray text `#1F2937`, Light gray accent `#F3F4F6`, Dark premium BGs `#0A0A0A` / `#1A1A2E`. Pull from client branding when available.
- **Typography:** Inter (body), Montserrat (headings). Clean sans-serif. Bold for display. No novelty fonts.
- **Layout:** Mobile-first, card-based collections, full-viewport hero sections, sticky nav, dark footer, grid (1 col mobile → 2 tablet → 3 desktop).
- **Skeleton first, customisation second** — reusable structural foundation, then client branding on top.
- **Quality:** `npm run build` must pass with zero errors/warnings. Responsive at 375px, 768px, 1280px. All links working. Accessibility contrast met.

---

## Tools
- **Web stack (real estate sites):** Next.js 14+ (App Router) + Tailwind CSS. Static export. See `context/web-design-preferences.md` for full details.
- **Web stack (Student Directory):** Next.js 14+ (App Router) + Tailwind CSS (frontend), Supabase/PostgreSQL (database + auth + API + future real-time chat).
- **Deployment:** GitHub → Vercel (default, may vary by project).
- **Data architecture (real estate):** Single `site-data.json` + accessor functions in `src/lib/data.js`.
- **Data architecture (Student Directory):** Star schema. Write pipeline: Collect → Ingest (batch) → Compute (normalize + precompute faculty distances) → Store. Read pipeline: quiz filters → sorted results → detail view. Full spec in `context/data-architecture.md`.
