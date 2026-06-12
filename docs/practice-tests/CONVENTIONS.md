# Practice-Tests — Repo Conventions

> Reference for building practice-test pages in StudentX. Documents how the
> existing repo actually works so new pages match. Read-only survey; nothing
> here was changed.
>
> **⚠️ `docs/practice-tests/PLAN.md` does not exist in this repo** (searched the
> full tree and git index — only an unrelated `context/agent-plan.md` and
> `src/app/api/landlord/billing/plans/` turned up). The task framed PLAN.md as
> the source of truth; since it is absent, the "Deviations from PLAN.md" section
> at the end flags the repo facts most likely to contradict an as-yet-unwritten
> plan, rather than line-by-line conflicts.

---

## 1. Framework

- **Next.js `16.2.4`**, **React `19.2.4`** (`package.json`).
- **App Router.** All routes live under `src/app/`. There is no `pages/` dir.
- **Locale-prefixed routing** via `next-intl` `^4.9.0`: every page sits under
  `src/app/[locale]/…`. The root layout (`src/app/layout.js`) is a pure
  pass-through; the real `<html>/<body>` shell is `src/app/[locale]/layout.js`
  (it sets `lang` from `params.locale`). `localePrefix` is effectively
  `never`/`as-needed` — `'en'` is injected silently, so URLs read
  `/student/ausom/semester-2`, not `/en/student/...`.
- Page components are **async server components** that `await params` and call
  `setRequestLocale(locale)` before rendering. Example
  (`src/app/[locale]/student/ausom/semester-2/page.js:9`):
  ```js
  export default async function Semester2Page({ params }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <Semester2Content />;
  }
  ```
- **No TypeScript.** The project is plain JavaScript (`.js`). There is **no
  `tsconfig.json`** and no `.ts/.tsx` files in `src/`. "TS config strictness"
  does not apply. The only config is `jsconfig.json`, which exists solely for
  the path alias:
  ```json
  { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
  ```
  So imports use `@/components/HubButton`, `@/lib/requireStudent`, etc.
- **ESLint** flat config (`eslint.config.mjs`) extending
  `eslint-config-next/core-web-vitals`. `react-hooks/set-state-in-effect` is
  downgraded to `warn`. Worktrees/coverage/`.next` are ignored.

## 2. Styling — design tokens (future pages MUST match)

- **Tailwind CSS v4** (`tailwindcss: ^4`), configured **entirely in CSS** — there
  is **no `tailwind.config.js`**. PostCSS plugin only
  (`postcss.config.mjs` → `@tailwindcss/postcss`). Tokens are declared in
  `src/app/globals.css` via `@import "tailwindcss"` + an `@theme inline` block.
- The themed page surface ("Stripe-modern" rebrand) is the relevant style for
  the practice-test pages. **Important:** the actual ausom pages do **not** use
  the `src/components/ui/*` components (those are a separate, older
  "neo-brutalist Propylaea" look — hard offset shadows, uppercase, `rounded-sm`).
  Match `HubButton` and the inline-style hub pages instead. See §3 and §5.

### Colors (`src/app/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--color-blue` (iris) | `#635BFF` | primary / CTAs / active accent |
| `--color-night` (ink) | `#0a2540` | text / dark surfaces |
| `--color-stone` | `#ffffff` | page background (canvas) |
| `--color-parchment` | `#f6f4ff` | card/input surface (light iris tint) |
| `--color-magenta` | `#ff5fa2` | accent / `pending` pill |
| `--color-yellow` | `#ffcb57` | accent / ornament / `verified` pill |
| `--color-iris-soft` | `#ece7ff` | section backgrounds |
| `--color-peach-soft` | `#ffe7d6` | gradient stop |
| `--gradient-brand` | `linear-gradient(120deg,#635BFF 0%,#ff5fa2 50%,#ffcb57 100%)` | wordmark / hero / `.bg-brand` |

Legacy aliases (`--color-navy`, `--color-midnight`, `--color-ink`,
`--color-text`, `--color-white`, `--color-gray-light`) all point at the above.
Tailwind utilities exposed: `bg-stone`, `text-night`, `bg-parchment`,
`bg-blue`, `text-white`, `bg-yellow`, `bg-magenta`, etc.

The hub pages use **literal hex values inline** rather than tokens —
ink `#0a2540` (often as `rgba(10,37,64,α)`), iris `#635BFF`, white `#ffffff`.
Common opacities: text-muted `rgba(10,37,64,0.45)`, subtext `rgba(10,37,64,0.6)`,
borders `rgba(10,37,64,0.12)`, hairlines `rgba(10,37,64,0.06)`.

### Fonts
- **Inter** (display + body) and **Inter Tight** (large labels), via
  `next/font/google` in `src/app/[locale]/layout.js`:
  ```js
  const inter = Inter({ subsets: ['latin','greek'], variable: '--font-inter', weight: ['400','500','600','700'], display: 'swap' });
  const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight', weight: ['400','500','600','700'], display: 'swap' });
  ```
  Exposed as CSS vars `--font-inter` / `--font-inter-tight`, wired into
  `--font-sans` / `--font-display`. Headings get `letter-spacing: -0.02em`.
  `HubButton` labels use `var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)`.
- Body defaults: `font-feature-settings: "ss01","cv11"`. Selection + focus
  rings are iris (`#635BFF`), focus `outline-offset: 2px; border-radius: 4px`.

### Spacing & layout (from the ausom pages)
- Centered single column. Hub page max-width **480px**; subject list page
  **460px**.
- Back-link row padding: `32px 24px 0`. Main section padding:
  `48px 24px 64px`, flex column, `align-items: center`.
- Card grid gap: **16px**. Semester hub is `grid-template-columns: repeat(2,1fr)`;
  the subject list is a single-column flex stack.

### Border radii
- `HubButton` card: **`borderRadius: 22`** (px). Badge/arrow pills: `999` (full).
- `ui/Card.js`: `rounded-sm`. `ui/Button.js`: `rounded` (sm/md), with `sm`/`lg`
  size variants. Focus ring radius `4px`. (Use HubButton's `22` for new
  practice-test cards to match the existing pages.)

### Shadows (HubButton)
- Rest: `0 1px 3px rgba(10,37,64,0.06), 0 10px 28px -12px rgba(10,37,64,0.16)`.
- Active/hover: `0 22px 48px -18px rgba(99,91,255,0.30), 0 6px 18px -10px rgba(10,37,64,0.10)`,
  plus `transform: translateY(-2px)` and iris border.
- Transition: `220ms cubic-bezier(.2,.7,.2,1)`.

## 3. The page itself — `/student/ausom/semester-2`

- **File:** `src/app/[locale]/student/ausom/semester-2/page.js`.
- **Parent hub:** `src/app/[locale]/student/ausom/page.js` (`/student/ausom`),
  whose parent is `/student` (`src/app/[locale]/student/page.js`, "Student
  Services").
- **Data source:** a **hardcoded in-file array** — there is no DB, no CMS, no
  `content/` dir. The subject list:
  ```js
  const SUBJECTS = [
    { id: 'med-informatics', label: 'Medical Informatics' },
    { id: 'anatomy-1',       label: 'Anatomy I' },
    { id: 'histology',       label: 'General Histology' },
    { id: 'biochemistry-1',  label: 'Biochemistry I' },
    { id: 'physiology',      label: 'General Physiology' },
  ];
  ```
  The parent hub generates 12 semesters with `Array.from({length:12})`; only
  Semester 2 is active (`href: '/student/ausom/semester-2'`), the rest are
  `comingSoon`.
- **Rendering:** maps the array to `<HubButton label={s.label} subtext="" comingSoon />`.
  Every subject currently renders with `comingSoon` (so all show the "Soon"
  badge and are non-clickable). A back-link (`← Semesters`) sits above the grid.
- **"Soon" badge:** produced by `HubButton`'s `comingSoon` prop, **not** a
  separate component. When `comingSoon` is true the card renders a pill reading
  **"Soon"** (`<span aria-label="Coming soon">Soon</span>`), drops opacity to
  `0.65`, uses a translucent white background, disables hover, and renders as a
  plain `<div aria-disabled="true">` (no link). When false it renders an
  `ArrowUpRight` pill and wraps in a `next/link` (or `<a target="_blank">` if
  `external`). See `src/components/HubButton.js`.
- These pages are **static** — pure presentational server components with
  hardcoded data; no auth gate, no fetch.

## 4. Supabase

- **Client libs** (`src/lib/`), pick by context:
  - `supabaseBrowser.js` → `getSupabaseBrowser()` — memoized browser client,
    `persistSession: true`, `autoRefreshToken: true`. Client components only.
  - `supabase.js` → `getSupabase()` — memoized anon client; fine for
    already-public reads (no RLS context).
  - `supabaseServer.js` — server helpers:
    - `getSupabaseWithToken(token)` — anon-key client with the caller's JWT in
      the `Authorization` header so **RLS runs as that user**. Use for
      permission-honoring reads.
    - `getUserFromToken(token)` — validates a JWT (fast local `jose`/JWKS
      verify via `verifyJwt.js`, falls back to `supabase.auth.getUser`).
    - `extractToken(request)` — pulls the Bearer token from the header.
    - **`getSupabaseAsService()` — service-role client that BYPASSES RLS.**
      Server-side only. Used sparingly (orphan-auth cleanup, locked
      `faculty_distances` writes). Plus `deleteAuthUserAsService` /
      `cleanupFreshOrphanAuthUser`.
- **Env var names** (`.env.local.example`):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`; also `ADMIN_EMAILS`, Stripe keys, and
  `NEXT_PUBLIC_SITE_URL`. In prod these are Cloudflare Worker secrets
  (`wrangler secret put …`).
- **Migrations:** numbered SQL files in **`supabase/migrations/`** (`001_*` …
  `037_*`), **not** a top-level `migrations/`. `supabase/config.toml`
  (`project_id = "StudentDirectory"`) + `supabase/seed.sql`.
  `.github/workflows/migration-check.yml` runs `supabase start` on every PR to
  apply them. **Convention:** apply a migration to prod *before* merging the
  PR that consumes it (Cloudflare deploys on push-to-main with no
  migration-aware gate). Apply via `mcp__supabase__apply_migration` or
  `supabase db push`. New NOT-NULL columns must also be seeded in
  `supabase/seed.sql` or `supabase start` fails.
- **Service-role usage exists** — yes, see `getSupabaseAsService()` above
  (`src/lib/supabaseServer.js`).
- **Auth setup:** Supabase Auth. Access token is stored in the
  `sb-access-token` cookie (`src/lib/authCookies.js` → `SB_ACCESS_TOKEN_COOKIE`),
  set by `SessionSync`. Server gates wrap `React.cache()`:
  - `requireStudent()` → `{ student, user, supabase, token }`,
    `{ kind:'wrong-role', conflict_role, email }`, or `null`
    (`src/lib/requireStudent.js`). `requireLandlord()` mirrors it.
    `hasAuthCookie()` is a fast presence probe so guests skip the round-trip.
  - Roles live in `students` / `landlords` tables (keyed by `auth_user_id`);
    OAuth providers in `src/components/student/OAuthProviders.js`.
- **Admin concept:** yes, but lightweight — **no separate admin table or
  password**. `src/lib/requireAdmin.js`: an admin is any authenticated user
  whose email is in the comma-separated `ADMIN_EMAILS` env allowlist
  (`isAdminEmail`). `requireAdmin()` (server-component gate) returns
  `{ user, supabase, token }`, `{ kind:'not-admin', email }`, or `null`;
  `requireAdminApi(request)` is the Bearer-token route gate returning
  `{ ok, status, error }`. Admin routes live under `/admin/*` and
  `/api/admin/*`. **`ADMIN_EMAILS` is not set in-repo** — until the operator
  sets the secret, all admin routes 403.

## 5. Reusable UI

Two distinct style families exist — **pick the right one for practice tests**.

**Use these for the practice-test pages (matches `/student/ausom/*`):**
- **`src/components/HubButton.js`** (`'use client'`) — the soft Stripe-modern
  card/button used by every ausom page. Props:
  `label, subtext, href, external=false, comingSoon=false`. Handles the "Soon"
  badge, the arrow-pill CTA, hover lift, and link vs. `<div>` rendering. This
  is the primary building block for new semester/subject/test pages.

**Older "Propylaea/brutalist" set (`src/components/ui/`) — different look,
likely NOT what practice-test pages want unless deliberately mixing:**
- `Button.js` (`'use client'`) — neo-brutalist button, iris fill + `#0a2540`
  hard offset shadow, uppercase, variants `primary|gold|onDark|outline|
  outlineOnDark|ghost`, sizes `sm|md|lg`, optional `animated` WebGL mesh.
  Links via `@/i18n/navigation`.
- `Card.js` — parchment/stone/night/white tones, `rounded-sm`, optional hover
  lift and thin border.
- `Pill.js` — small uppercase label; variants `verified|pending|amenity|info|
  onDark`. (A badge primitive, but styled differently from HubButton's "Soon".)
- `ConfirmDialog.js` — the modal/dialog primitive. `Field.js` (form field),
  `Icon.js`, `OrnamentRule.js`, `SectionHeader.js`, `Pill.js`, `VerifiedSeal.js`,
  `EncryptButton.js`.
- Other top-level components of note: `BauhausLoader.js` /
  `CityGlobeLoader.js` / `GlobeLoader.js` (blocking spinners — keyframes in
  `globals.css`), `UnreadBadge.js`, `ListingCard.js`, `Navbar.js`.

There is **no generic Modal** beyond `ConfirmDialog.js`, and the "badge" the
ausom pages use is built inline in `HubButton`, not `Pill`.

## 6. Build / deploy

- **Scripts** (`package.json`): `dev` (`next dev`), `build` (`next build`),
  `start`, `lint` (`eslint`), `test` (`vitest run`), `test:watch`,
  `test:coverage`. Cloudflare: `cf:build` (`opennextjs-cloudflare build`),
  `deploy` (`cf:build` + `opennextjs-cloudflare deploy`), `preview`.
- **Hosting:** **Cloudflare Workers** via **OpenNext**
  (`@opennextjs/cloudflare`, `open-next.config.ts`, `cf/worker-entry.mjs`).
  `wrangler.jsonc`: worker `name: "studentx"`, `compatibility_date
  "2025-04-01"`, `nodejs_compat`, public `*.workers.dev` URL plus a custom
  apex/www domain. Node `>=22`.
- **CI** (`.github/workflows/`): `ci.yml` runs on push/PR to `main` →
  `npm ci` → lint → test → build (build needs `NEXT_PUBLIC_SUPABASE_*`
  secrets). `migration-check.yml` applies migrations via `supabase start`.
  `claude.yml` + `claude-code-review.yml` are the Claude bots.
- **Deploy trigger:** Cloudflare deploys on **push-to-main** (no
  migration-aware gate — see §4 ordering rule). Tests live in `__tests__/`
  mirroring `src/`; `@/` alias works in tests via `vitest.config.js`.

---

## Deviations from PLAN.md

`docs/practice-tests/PLAN.md` is **absent**, so there is nothing to diff
against directly. The following are the repo realities most likely to conflict
with assumptions a practice-test plan (its sections 2–4) would make — verify
the plan against these before implementing:

1. **No `content/` directory / content convention.** The existing
   practice-test pages hold their data as **hardcoded in-file arrays**
   (`SUBJECTS`, `SEMESTERS`). If PLAN.md assumes a `content/` (or `data/`,
   MDX, JSON, or DB-backed) source for questions/subjects, that does not exist
   today — `data/` holds unrelated importer fixtures, and there is no CMS.

2. **Plain JavaScript, not TypeScript.** No `tsconfig.json`, no `.ts/.tsx`.
   Any plan section specifying TS types, strict mode, or `.tsx` files
   conflicts — new files should be `.js` server/client components.

3. **App Router + `[locale]` segment, `next-intl`.** Routes must live under
   `src/app/[locale]/…`, be async, `await params`, and call
   `setRequestLocale(locale)`. A plan that assumes the Pages Router, plain
   `src/app/student/...` without `[locale]`, or no locale handling will not
   match.

4. **Tailwind v4 with no config file; tokens live in `globals.css`.** Any plan
   referencing a `tailwind.config.js` (custom theme extension, plugins) is
   wrong — extend `@theme inline` in `src/app/globals.css` instead.

5. **Two competing UI styles.** The ausom pages use `HubButton` + inline
   styles (Stripe-modern, `radius 22`, soft shadows), **not** the
   `src/components/ui/*` brutalist set. A plan that says "reuse `ui/Button`,
   `ui/Card`, `ui/Pill`" would produce a visually inconsistent page; match
   `HubButton` for parity with the existing route.

6. **"Soon" badge is a `HubButton` prop, not a component.** A plan calling for
   a standalone Badge/Pill for coming-soon states should instead pass
   `comingSoon` to `HubButton`.

7. **Pages are static & unauthenticated today.** If PLAN.md assumes
   practice-test pages are gated by `requireStudent()` or persist attempts to
   Supabase, note the current pages do neither — adding auth/data would be new
   surface area (helpers exist in §4, but no migration/table for tests does).
