# StudentX — Security Audit

**Date:** 2026-06-12
**Scope:** `MichaelChar/StudentX` — Next.js 16 app on Cloudflare Workers (OpenNext), Supabase Postgres/Auth, Stripe, Resend.
**Method:** Source review of API routes, auth/JWT helpers, middleware, SQL migrations, config; plus live Supabase security advisors and table/RLS inventory for project `ecluqurlfbvkxrnoyhaq`.
**Reviewer:** Claude (automated audit)

> This is an assessment with prioritized, issue-ready suggestions. No code was changed.

---

## Executive summary

The codebase is notably **security-conscious**. Strong points observed:

- JWTs are verified locally against the project JWKS with `audience: 'authenticated'` pinned, with a network fallback (`src/lib/verifyJwt.js`, `src/lib/supabaseServer.js`).
- Session cookie is `httpOnly`, `secure` in prod, `sameSite=lax`, 1h TTL, and the token is **validated before** being written (`src/app/api/auth/session/route.js`).
- Stripe and Resend/Svix webhooks both verify signatures before trusting payloads, with replay protection on Resend (`src/app/api/webhooks/*`).
- Open-redirect hardening (`src/lib/safeNext.js`), strict URL allowlist for the listing importer, 256-bit CSPRNG claim tokens, log-injection-safe error beacon, and a real CSP + HSTS + `X-Frame-Options: DENY` baseline (`next.config.mjs`).
- **No live secrets are committed.** Only the Supabase **anon** key (public-by-design, RLS-protected) appears in tracked files (`.env.production`, `wrangler.jsonc`). No service-role key, Stripe secret, or webhook secret is in git.

No confirmed remotely-exploitable data-theft vulnerability was found. The findings below are mostly **database-layer hardening**, **blast-radius / multi-tenancy hygiene**, and **defense-in-depth**.

### Findings at a glance

| # | Severity | Finding | Area |
|---|----------|---------|------|
| 1 | **Medium-High** | Production database is shared with an unrelated app's schema (`credentials`, `invoices`, `billing_customers`, `automations`, `runs`, …) | Data segregation / blast radius |
| 2 | **Medium** | `listing_views` RLS allows anyone (anon key) to INSERT/UPDATE arbitrary rows (`USING(true)`) | RLS / integrity |
| 3 | **Medium** | Cron auth accepts the shared secret via `?secret=` query string (leaks to logs/history) | Secrets handling |
| 4 | **Medium** | `link_orphan_landlord` lets a signed-in user claim a pre-seeded landlord by email — safe only if email confirmation is enforced | Account takeover (conditional) |
| 5 | **Low-Med** | `prevent_dual_role` trigger function has a mutable `search_path` | SQL / privilege |
| 6 | **Low-Med** | Listing importer follows redirects with no final-host re-check, private-IP block, or response-size cap | SSRF hardening |
| 7 | **Low** | Supabase Auth "leaked password protection" (HIBP) is disabled | Auth policy |
| 8 | **Low** | Several `SECURITY DEFINER` RPCs are directly executable by `authenticated` (e.g. `check_chat_rate_limit` with caller-supplied `p_max`) | Least privilege |
| 9 | **Low** | `.env.production` is intentionally git-tracked; only safe today, fragile to secret-creep | Secrets hygiene |
| 10 | **Low** | Misc hardening: admin email compare case-sensitivity, `report` rate-limit IP spoofing, unauthenticated/unbounded `log-client-error` | Defense-in-depth |

---

## Detailed findings (issue-ready)

Each finding below is written so it can be pasted into a GitHub issue. Suggested title, labels, and severity are included.

---

### Issue 1 — Separate StudentX from the co-located app schema (shared Supabase project)

**Labels:** `security`, `infra`, `priority:high`
**Severity:** Medium-High (blast radius; not currently leaking data)

**Observation.** The `public` schema of the production Supabase project (`ecluqurlfbvkxrnoyhaq`) contains StudentX's tables **and** a full set of tables that belong to an unrelated application:

`tenants`, `users`, `profiles`, `prompt_templates`, `automations`, `automation_instances`, `runs`, `credentials`, `trigger_logs`, `support_messages`, `support_tickets`, `billing_customers`, `invoices`, `report_history`.

These are all currently empty (0 rows) and have RLS enabled with **no policies** (so anon/authenticated are denied today). The Supabase security advisor reports each as `rls_enabled_no_policy` (INFO).

**Why it matters.**
- StudentX's `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and can therefore read/write `credentials`, `invoices`, `billing_customers`, etc. If the StudentX service key leaks (Worker secret, CI, a bug in a service-role route), the other app's data is in scope too — and vice-versa if that app shares the same database.
- A `credentials` table is a high-value target; co-locating it with a separate public-facing app needlessly enlarges its attack surface and complicates every future RLS audit.
- All these tables are exposed through the same PostgREST API surface.

**Recommendation.**
1. Decide whether this co-tenancy is intentional. If StudentX and the other app are genuinely separate products, **move StudentX to its own Supabase project** (cleanest isolation).
2. If those tables are abandoned/experimental, **drop them** from production so they don't sit alongside live data.
3. Confirm the StudentX service-role key is **not** shared with any other service, and rotate it if its provenance is uncertain.
4. Re-run `get_advisors` after cleanup to confirm a clean baseline.

---

### Issue 2 — `listing_views` RLS lets anyone insert/overwrite view counts

**Labels:** `security`, `database`, `rls`
**Severity:** Medium (confirmed exploitable; integrity/abuse, not disclosure)

**Observation.** `supabase/migrations/009_listing_views.sql`:

```sql
CREATE POLICY "Public can record views"   ON listing_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can increment views" ON listing_views FOR UPDATE USING (true) WITH CHECK (true);
```

The Supabase advisor flags both (`rls_policy_always_true`, WARN). Because the anon key is public, **anyone** can `INSERT` arbitrary `(listing_id, view_date, view_count)` rows or `UPDATE` any existing row to any `view_count`.

**Why it matters.** View counts feed landlord-facing analytics (`/api/landlord/analytics`) and "popularity" signals. An attacker (or a competitor) can inflate or zero-out any listing's views. The FK to `listings` and the PK bound it to valid listings, but the values are fully attacker-controlled. Low business impact, but it is a real RLS bypass of write protection.

**Recommendation.** The app already records views through the `increment_listing_view` RPC (`src/app/api/listings/[id]/view/route.js`). Make that RPC `SECURITY DEFINER`, then **remove the public `INSERT`/`UPDATE` policies** and `REVOKE` direct table writes from `anon`/`authenticated`. Drop the unused direct-upsert fallback in the route once the RPC is the only path. This keeps view tracking working while removing arbitrary client writes.

---

### Issue 3 — Cron secret accepted via URL query string

**Labels:** `security`, `secrets`
**Severity:** Medium

**Observation.** Every cron route authorizes with either an `x-cron-secret` header **or** a `?secret=` query parameter, e.g. `src/app/api/cron/recompute-distances/route.js`:

```js
const headerSecret = request.headers.get('x-cron-secret');
if (headerSecret === secret) return true;
const { searchParams } = new URL(request.url);
return searchParams.get('secret') === secret;
```

Same pattern in `landlord-message-digest`, `student-message-digest`, and `synthetic-en-listing`.

**Why it matters.** Secrets in URLs are routinely captured in Cloudflare access/request logs, upstream proxies, browser history, and `Referer` headers — a much larger exposure surface than a request header. The shared `CRON_SECRET` gates service-role-backed endpoints (digests read landlord emails, student names, message bodies).

**Recommendation.** Drop the query-param branch and require the `x-cron-secret` header only (the in-repo dispatcher `cf/worker-entry.mjs` already POSTs the header, so this is internal-only). Compare with a constant-time check as defense-in-depth. Rotate `CRON_SECRET` if it has ever been used in a URL.

---

### Issue 4 — `link_orphan_landlord` allows email-based account claim; verify email confirmation is enforced

**Labels:** `security`, `auth`, `database`
**Severity:** Medium (conditional on auth settings)

**Observation.** `supabase/migrations/018_link_orphan_landlord.sql` (SECURITY DEFINER, callable by `authenticated`):

```sql
UPDATE landlords SET auth_user_id = auth.uid()
WHERE landlord_id = p_landlord_id
  AND auth_user_id IS NULL
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND NOT EXISTS (SELECT 1 FROM landlords WHERE auth_user_id = auth.uid());
```

A signed-in user can bind any **unclaimed, pre-seeded** landlord row to their account if their auth email equals the landlord's email. The seed/migration data shows real landlord rows pre-created with emails (e.g. migration 051's `0104`).

**Why it matters.** This is only as strong as email ownership. If Supabase Auth **email confirmation is disabled**, an attacker can register with a victim landlord's email (no proof of ownership), obtain a session, call `link_orphan_landlord`, and take over that landlord's listings/inbox. The same trust assumption underlies the `handle_new_student_user` / `prevent_dual_role` email branches.

**Recommendation.**
1. Confirm **"Confirm email" is ON** in Supabase Auth (and for OAuth, that provider emails are verified). Document this as a security-critical setting.
2. Consider gating `link_orphan_landlord` on `auth.jwt()->>'email_confirmed_at'` / a verified-email check as defense-in-depth, so the function can't run for an unconfirmed session even if the project setting regresses.

---

### Issue 5 — Pin `search_path` on `prevent_dual_role` (SECURITY DEFINER)

**Labels:** `security`, `database`
**Severity:** Low-Medium

**Observation.** Supabase advisor `function_search_path_mutable` (WARN) for `public.prevent_dual_role`. The trigger function (created in migration 036) is `SECURITY INVOKER` but does **not** `SET search_path`. It already schema-qualifies its references (`public.students`, `public.landlords`), but the unpinned `search_path` is still flagged. Other functions in the codebase correctly pin it (`SET search_path = public` / `''`).

**Why it matters.** A function with a mutable `search_path` can be coerced into resolving unqualified object names against an attacker-influenced schema — a privilege-escalation primitive that is most dangerous for `SECURITY DEFINER` functions. `prevent_dual_role` is `SECURITY INVOKER`, so the practical risk here is low, but pinning `search_path` is the standard, advisor-recommended hardening and removes the warning.

**Recommendation.** `ALTER FUNCTION public.prevent_dual_role() SET search_path = ''` (and schema-qualify references), matching the pattern already used in migrations 033/051/059. Sweep all `SECURITY DEFINER` functions for the same.

---

### Issue 6 — Harden the listing importer against SSRF (redirects / private IPs / size)

**Labels:** `security`, `ssrf`
**Severity:** Low-Medium

**Observation.** `src/lib/importers/index.js` allowlists hosts correctly (`hostname === d || endsWith('.'+d)` for `spiti.gr`/`xe.gr`) — good, no substring bypass. But `fetch(url)` uses default redirect following, there's no re-validation of the **final** URL host, no private-IP/loopback block, and no response-size cap (`await res.text()`).

**Why it matters.** If either allowlisted site has an open redirect, an authenticated landlord could chain it to reach an internal/metadata endpoint via the Worker. A hostile or huge response page could also exhaust Worker memory. Likelihood is low (requires an open redirect on a third-party site), but the mitigations are cheap.

**Recommendation.** Set `redirect: 'manual'` (or follow then re-assert the final host is still allowlisted), reject resolved private/link-local IP ranges, and cap the body size read. Keep the existing 10s timeout.

---

### Issue 7 — Enable leaked-password protection (HIBP)

**Labels:** `security`, `auth`, `good-first-issue`
**Severity:** Low

**Observation.** Supabase advisor `auth_leaked_password_protection` (WARN): the HaveIBeenPwned check is disabled.

**Recommendation.** Enable it in Supabase Auth → Password security. One-click; blocks known-compromised passwords at signup/reset. Consider also setting a minimum length/strength policy.

---

### Issue 8 — Tighten direct EXECUTE on `SECURITY DEFINER` RPCs

**Labels:** `security`, `database`
**Severity:** Low

**Observation.** Advisor `authenticated_security_definer_function_executable` flags `check_chat_rate_limit`, `create_student_profile`, `link_orphan_landlord`, `mark_messages_read`, `start_inquiry_authenticated` as directly callable by `authenticated` via `/rest/v1/rpc/...`. Most are intentional app RPCs. The notable one is `check_chat_rate_limit(p_inquiry_id, p_sender_user_id, p_max, p_window)`: a client can call it directly with `p_sender_user_id` and `p_max`/`p_window` of their choosing. Enforcement is actually done by the `enforce_chat_rate_limit` BEFORE-INSERT trigger (hardcoded 30/hour), so the message cap is **not** bypassable today — but exposing the parameterized checker to clients is unnecessary surface.

**Recommendation.** `REVOKE EXECUTE ... FROM authenticated` on `check_chat_rate_limit` (keep it callable only from the trigger / `service_role` for dashboards). Audit `link_orphan_landlord` and the profile RPCs to confirm each genuinely needs `authenticated` execute and that each validates `auth.uid()` server-side (they appear to).

---

### Issue 9 — Don't rely on `.env.production` being "safe to commit"

**Labels:** `security`, `secrets`, `process`
**Severity:** Low / informational

**Observation.** `.gitignore` ignores `.env*` but explicitly **un-ignores** `.env.production` (`!.env.production`), which is tracked and currently holds only `NEXT_PUBLIC_*` values (anon key + URLs) — safe today. The risk is process drift: a future edit that drops a server secret (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `CRON_SECRET`) into that file would silently commit it.

**Recommendation.** Add a CI secret-scanner (e.g. gitleaks) on PRs as a backstop, and/or move the public values into `wrangler.jsonc:vars` only (already mirrored there) and stop tracking `.env.production`. At minimum, add a comment + pre-commit guard that the file may contain `NEXT_PUBLIC_*` keys only.

---

### Issue 10 — Misc defense-in-depth

**Labels:** `security`, `hardening`
**Severity:** Low

- **Admin email comparison is inconsistent.** `src/app/api/admin/metrics/route.js` uses case-sensitive `adminEmails.includes(user.email)`, while `src/lib/requireAdmin.js` lowercases both sides. Both fail closed, but the metrics route could wrongly deny a legitimately-allowlisted admin on case mismatch. Standardize all admin checks on `isAdminEmail()` from `requireAdmin.js`.
- **`/api/listings/report` rate-limit IP can be spoofed** when `cf-connecting-ip` is absent (falls back to client-controlled `x-forwarded-for`/`x-real-ip`). On Cloudflare `cf-connecting-ip` is always present, so this is only a concern off-CF; keep the limiter keyed on `cf-connecting-ip` exclusively in production. (Also: the limiter is best-effort per-isolate, as the code already documents.)
- **`/api/log-client-error` is unauthenticated and unbounded.** Inputs are clamped and JSON-stringified (no log injection), but there's no rate limit. Consider a lightweight cap (the code's own TODO) so it can't be used to flood Worker logs.

---

## Appendix A — Things verified as sound (no action needed)

- **JWT verification:** `audience: 'authenticated'` pinned; `sub` required; JWKS cached per isolate; network fallback on local-verify miss (`src/lib/verifyJwt.js`, `src/lib/supabaseServer.js`).
- **Session cookie:** validated-before-set, `httpOnly` + `secure` (prod) + `sameSite=lax` + 1h TTL (`src/app/api/auth/session/route.js`, `src/lib/authCookies.js`).
- **Stripe webhook:** `constructEvent` signature verification; service-role client scoped to the handler (`src/app/api/webhooks/stripe/route.js`).
- **Resend webhook:** full Svix HMAC verification + 5-min replay window; rejects (non-200) when secret unset so retries occur (`src/app/api/webhooks/resend/route.js`).
- **Claim links:** 256-bit CSPRNG tokens, 30-day expiry, server-side expiry check; service-role use is gated by the unguessable token (`src/lib/pendingIds.js`, `src/lib/pendingPublish.js`).
- **Open redirect:** `safeNextPath` blocks protocol-relative, backslash, and control-char smuggling (`src/lib/safeNext.js`).
- **HTTP security headers:** CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`), HSTS preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Permissions-Policy (`next.config.mjs`). *Note:* `script-src` includes `'unsafe-inline'` (common with Next), which weakens XSS defense — a nonce-based CSP would be a future hardening, tracked separately if desired.
- **Secrets in git:** none beyond the public anon key.
- **Core RLS:** all `public` tables have RLS enabled; StudentX's "no-policy" tables (`pending_*`, `verification_requests`, `*_message_notifications`, `email_suppressions`) are intentionally service-role-only.

## Appendix B — Sources

- Supabase security advisors (`get_advisors type=security`) for project `ecluqurlfbvkxrnoyhaq`, 2026-06-12.
- Table/RLS inventory (`list_tables`).
- Repository source at `main` (commit current as of 2026-06-12).
