# Runbook — Register `studentx.uk` and verify Resend

**Blocks:** Resend transactional email · Cloudflare zone-scoped features · production URL flip · [PR #51](https://github.com/MichaelChar/StudentX/pull/51) (closed pending domain) · [PR #63](https://github.com/MichaelChar/StudentX/pull/63) (pre-staged re-apply, draft)

## Why this exists

Several things in production are blocked on registering `studentx.uk` (currently NXDOMAIN). This runbook is a checklist for the ~1h of active work + ~1-2 days of clock time it takes to unblock them.

Concrete blockers today:

1. **Email is silently broken.** Resend rejects sends from any unverified domain. Every outbound email path — inquiry to landlord, saved-searches digest, landlord message digest, synthetic alert — fails at the Resend `send` step. See [`docs/runbooks/synthetic-en-listing.md`](./synthetic-en-listing.md#domain-context) for the symptom from the synthetic check's side.
2. **PR #51 is closed pending this.** [PR #51](https://github.com/MichaelChar/StudentX/pull/51) tried swapping the from-address to `alerts@updates.studentx.uk` (a Resend best-practice subdomain). Closed because the parent zone doesn't exist yet — Resend can't verify a subdomain of a non-existent domain. The work is pre-staged on draft [PR #63](https://github.com/MichaelChar/StudentX/pull/63) (branch `fix/email-from-updates-subdomain-prestage`); resurrect after step 6.
3. **No Cloudflare zone.** Zone-scoped features all require a registered domain attached to the account, and the account currently has zero zones. On the **Free** plan you'd unlock Page Rules, Cloudflare Analytics with hostname filtering, and managed WAF rules; **Health Checks and custom WAF rules require Pro+**.
4. **Production URL points at workers.dev.** [`wrangler.jsonc`](../../wrangler.jsonc) lines 33-34 hard-pin `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` to `https://studentx.studentx-gr.workers.dev`. The code's default is `https://studentx.uk` — see the comment block at lines 27-32. Until DNS lands, every canonical URL, sitemap entry, og:url, and email link points at the workers.dev hostname.

## Style follows [`synthetic-en-listing.md`](./synthetic-en-listing.md)

Each step: **WHAT** to do, **EXPECTED** outcome, **IF IT FAILS** what to check.

---

## 1. Choose a registrar

`.uk` is a well-supported ccTLD — most international registrars sell it directly.

**Recommended registrars:**

| Registrar | URL | Notes |
|---|---|---|
| Cloudflare Registrar | https://dash.cloudflare.com | At-cost pricing, no markup. Simplest path since we already use CF. |
| Namecheap | https://www.namecheap.com | Popular, English UI, ~£5-8/yr. |
| Gandi | https://www.gandi.net | Clean UI, good DNS management. |

**EXPECTED:** registrar account created, `studentx.uk` purchased.

**IF IT FAILS:** if `studentx.uk` is taken — pick an alternative and update every reference in this runbook + `wrangler.jsonc` + the code's fallback defaults.

## 2. Register the domain

**WHAT:**
- Search for `studentx.uk` in the registrar.
- Add to cart, register for **at least 1 year**.
- **Decline any "premium DNS" / "WHOIS privacy" / "managed email" upsells** — Cloudflare replaces the registrar's DNS in step 3, and Resend handles email.

**EXPECTED:** registration receipt + domain visible in the registrar's "My Domains" panel within minutes.

**IF IT FAILS:**
- Payment declined — try a different card or PayPal.

## 3. Add the site to Cloudflare

**WHAT:**

1. Log in to https://dash.cloudflare.com.
2. Top right → **Add a Site** button.
3. Enter `studentx.uk`. Continue.
4. Select the **Free** plan. Continue.
5. Cloudflare scans existing DNS (a fresh registration usually has none) and shows a screen with **two nameserver hostnames** assigned to your zone, e.g.:
   ```
   xxx.ns.cloudflare.com
   yyy.ns.cloudflare.com
   ```
   (The exact `xxx`/`yyy` are unique per zone — copy them, don't guess.)
6. Switch tabs → registrar control panel → **Nameservers** / **DNS Management** section.
7. Replace the registrar's default nameservers with the **two CF hostnames** from step 5. Save.
8. Back in Cloudflare → click **Done, check nameservers**.

**EXPECTED:**
- Cloudflare zone status: `Pending` immediately, → `Active` once NS change propagates.
- Propagation: usually 1-12h, occasionally up to 48h. Cloudflare emails you when active.

**IF IT FAILS:**
- Status stays `Pending` >24h — re-check the registrar saved both NS hostnames exactly (case-insensitive but no typos). If the registrar's panel rejects the change, ask their support.
- `dig studentx.uk NS @8.8.8.8` from your laptop — if it still returns the old NS after 24h, the registrar didn't apply the change.

## 4. Add DNS records (after CF zone is `Active`)

**WHAT:** Cloudflare dashboard → **DNS** → **Records** → **Add record** for each row below.

The Resend-related TXT values (`resend._domainkey`, the SPF, the verification TXT) are **provided exactly by Resend** in step 5 — do that step in parallel and paste their values into the rows below. Don't transcribe by hand.

| Type | Name | Value | Proxy | Purpose |
|---|---|---|---|---|
| (added by step 6) | `@` (apex) | (Worker custom domain — see step 6) | n/a | Web traffic to the Worker |
| CNAME | `www` | `studentx.uk` | Proxied | Redirect www → apex (apex CNAME flattening handled by CF) |
| TXT | `@` (apex) | `v=spf1 include:amazonses.com ~all` | n/a | SPF — Resend sends via SES; verify the exact include shown in the Resend dashboard before saving |
| TXT | `resend._domainkey` | (long base64 from Resend) | n/a | DKIM — sign outgoing emails |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc-reports@studentx.uk` | n/a | DMARC — start permissive, escalate later |
| TXT | (Resend verification) | (random token from Resend) | n/a | Domain ownership proof for Resend |

**Optional but recommended — sending subdomain `updates.studentx.uk`** (matches PR #51's plan). If you set this up, repeat the SPF + DKIM + verification rows under the `updates` subdomain, e.g.:

| Type | Name | Value | Purpose |
|---|---|---|---|
| TXT | `updates` | (SPF value shown in the Resend dashboard for this subdomain) | SPF for the subdomain |
| TXT | `resend._domainkey.updates` | (Resend value) | DKIM for the subdomain |
| MX | `updates` | (Resend MX value, priority 10) | Receive bounce notifications |

Why a subdomain: isolates transactional sending reputation from anything you might later send from the apex (newsletters, marketing). PR #51 standardized on `alerts@updates.studentx.uk` for this reason.

**DMARC escalation path:**

1. Start `p=none` (above) — observe reports for 1-2 weeks.
2. Once you confirm only Resend sends as you, change to `p=quarantine`.
3. After another 1-2 weeks of clean reports, change to `p=reject`.

**EXPECTED:** records visible in the CF DNS panel; `dig` returns them within 1-5 min.

**IF IT FAILS:** if you forgot to set `Proxy: DNS only` for TXT/MX records — CF doesn't proxy non-A/CNAME records, so this is automatic; nothing to do. If a record won't save, CF will explain why (e.g. "duplicate" — delete the conflicting one).

## 5. Verify the domain in Resend

**WHAT:**

1. Log in to https://resend.com/domains.
2. **Add Domain** → enter `studentx.uk` (and separately `updates.studentx.uk` if you went with the subdomain in step 4).
3. Resend shows you 4-5 DNS records (SPF, DKIM, DMARC suggestion, MX, verification TXT). **Copy each value exactly** — paste them into Cloudflare DNS panel as step 4 records.
4. Back in Resend → click **Verify DNS Records**.

**EXPECTED:**
- Resend status: `Pending` → `Verified` within 30 min of records being live in CF.
- All 4-5 records show green checkmarks.

**IF IT FAILS:**
- One record red → click the red row, Resend shows what value it expected vs what it found. Usually a typo or an extra space.
- All records red after 30 min → run `dig <name>.studentx.uk TXT` from your laptop. If `dig` shows the right value but Resend doesn't see it, wait — Resend caches negative lookups for 5-10 min; click Verify again later.

## 6. Configure the Worker custom domain

**Option A (recommended) — `wrangler.jsonc` `routes`:**

Add to [`wrangler.jsonc`](../../wrangler.jsonc) (sibling of `triggers`):

```json
"routes": [
  { "pattern": "studentx.uk", "custom_domain": true },
  { "pattern": "www.studentx.uk", "custom_domain": true }
]
```

> Note: `custom_domain: true` routes take bare hostnames — wildcards (`/*`) and paths are rejected by `wrangler deploy` with "Wildcard operators (*) are not allowed in Custom Domains".

Then:

```bash
npm run cf:build && npx wrangler deploy
```

Wrangler creates the apex `A` record and the `www` `CNAME` automatically, both proxied (orange-cloud).

**Option B (manual) — Cloudflare dashboard:**

Workers & Pages → **studentx** → Settings → **Triggers** → **Add Custom Domain** → enter `studentx.uk`. Repeat for `www.studentx.uk`. Same outcome, more clicking.

**EXPECTED:**
- `dig studentx.uk A` returns Cloudflare anycast IPs.
- `curl -I https://studentx.uk` returns `200` from the Worker (cert is auto-provisioned by CF in 1-5 min).

**IF IT FAILS:**
- 525/526 SSL error → wait 5 min for the edge cert to provision, retry.
- 522 timeout → custom domain race — re-deploy the Worker.
- 1014 "CNAME cross-user banned" → the apex already had a conflicting CNAME from step 4; delete it and re-deploy.

## 7. Flip the URL config in `wrangler.jsonc`

**Do not run this step until step 6's `curl -I https://studentx.uk` returns 200.** Flipping `NEXT_PUBLIC_SITE_URL` before the edge cert provisions causes 525 errors on every email link and canonical for 1-5 min.

**WHAT:** Edit [`wrangler.jsonc`](../../wrangler.jsonc) lines 33-34. Change:

```jsonc
"NEXT_PUBLIC_SITE_URL": "https://studentx.studentx-gr.workers.dev",
"NEXT_PUBLIC_APP_URL": "https://studentx.studentx-gr.workers.dev",
```

to:

```jsonc
"NEXT_PUBLIC_SITE_URL": "https://studentx.uk",
"NEXT_PUBLIC_APP_URL": "https://studentx.uk",
```

(Or — per the existing comment in `wrangler.jsonc` lines 27-32 — **delete both lines entirely**; the code's default fallback is `https://studentx.uk`, so removing them has the same effect.)

Then:

```bash
npm run cf:build && npx wrangler deploy
```

**EXPECTED:**
- New deploy logs show the updated env values.
- Page source on https://studentx.uk/en/listing/0100006 has `<link rel="canonical" href="https://studentx.uk/en/listing/0100006">`.
- Sitemap at https://studentx.uk/sitemap.xml lists `https://studentx.uk/...` URLs.
- Outbound email links resolve to `studentx.uk` paths.

**IF IT FAILS:**
- Canonical still points at workers.dev → Worker hasn't picked up new env; re-deploy and force-refresh.
- 404 on the new domain but workers.dev still works → custom-domain route from step 6 didn't take; check Workers → studentx → Triggers in dashboard.

## 8. Resurrect [PR #51](https://github.com/MichaelChar/StudentX/pull/51) via [PR #63](https://github.com/MichaelChar/StudentX/pull/63)

There's a pre-staged draft branch (`fix/email-from-updates-subdomain-prestage`, opened as PR #63) that re-applies PR #51's changes. Once Resend verification of `updates.studentx.uk` is green (step 5):

1. Open PR #63.
2. Mark **Ready for Review**.
3. Merge.

Files it touches (4 lines, 1 per file):

- `src/lib/inquiryEmail.js`
- `src/app/api/cron/landlord-message-digest/route.js`
- `src/app/api/cron/saved-searches-digest/route.js`
- `src/app/api/saved-searches/route.js`

After merge + deploy: trigger a test inquiry from a student account, confirm the landlord receives an email from `alerts@updates.studentx.uk`.

## 9. Verification commands

Run from your laptop after each major step:

```bash
# After step 3 (NS change):
dig studentx.uk NS                                # should return *.ns.cloudflare.com

# After step 4 (DNS records):
dig studentx.uk TXT                               # should include the SPF record
dig resend._domainkey.studentx.uk TXT             # should return the DKIM
dig _dmarc.studentx.uk TXT                        # should return the DMARC

# After step 6 (custom domain):
curl -I https://studentx.uk                       # should return 200 from the Worker
curl -s https://studentx.uk/en/listing/0100006 \
  | grep "Sign in to view this listing"           # smoke-test routing + i18n through new domain

# After step 7 (URL flip):
curl -s https://studentx.uk/en/listing/0100006 \
  | grep '<link rel="canonical"'                  # should reference studentx.uk, not workers.dev
```

## 10. Synthetic check sanity

The synthetic check ([`docs/runbooks/synthetic-en-listing.md`](./synthetic-en-listing.md)) reads `NEXT_PUBLIC_APP_URL` from `wrangler.jsonc` to know what hostname to probe. Once you flip the URL in step 7, the next 15-min cron run will probe `https://studentx.uk/en/listing/0100006` automatically. `SYNTHETIC_LISTING_ID` does not change.

**Verify after the URL flip deploy:**

```bash
npx wrangler tail --name studentx
# Wait up to 15 min for the next cron tick. Look for:
#   "synthetic-en-listing ok status=200"
# Or, manually trigger via dashboard: Workers → studentx → Triggers → "Trigger Cron" on */15.
```

Once Resend verification + `RESEND_API_KEY` Worker secret are in place, the synthetic check will also start emailing on regression instead of being logs-only. Update [`docs/runbooks/synthetic-en-listing.md`](./synthetic-en-listing.md) "Status as of merge" note to reflect that.

Monitor `wrangler tail` for ~24h after the flip to confirm no spurious failures.

## 11. Search Console (optional)

Once `https://studentx.uk` is live and serving correctly:

1. https://search.google.com/search-console → **Add Property** → enter `studentx.uk`.
2. Verify via DNS TXT (Cloudflare DNS panel — Google gives you the exact value).
3. **Sitemaps** → submit `https://studentx.uk/sitemap.xml`.
4. **URL Inspection** → request indexing for `/en/listing/`, `/en/`, and a couple of high-value listing pages.

The old `studentx.studentx-gr.workers.dev` URLs will drop out of Google's index naturally over a few weeks. If you want to accelerate: in the workers.dev property (if you have one), submit a removal request — but this is optional, the workers.dev hostname has no organic traffic.

## 12. Rollback plan

DNS changes are reversible. If something breaks at any step:

| Step | Rollback |
|---|---|
| 7 (URL flip) | Revert the 2 lines in `wrangler.jsonc` to the workers.dev values, `npm run cf:build && wrangler deploy`. App's internal links go back to workers.dev within 1 deploy. |
| 6 (custom domain) | Workers & Pages → studentx → Triggers → remove the custom domain entries. The workers.dev hostname stays live throughout — never goes down. |
| 4 (DNS records) | CF DNS panel → delete records individually. Propagation back is fast (CF TTLs default to 5 min for unproxied records). |
| 3 (CF zone add) | Zone settings → **Remove Site**. Then at the registrar, restore the registrar's default nameservers. ~24h propagation back. |
| 2 (registration) | Most registrars allow refund within a grace period. Check the registrar's terms. After grace period, no refund but the domain is yours for the year. |

The workers.dev hostname (`studentx.studentx-gr.workers.dev`) **stays live throughout**. Nothing here can take production down — the worst case is the new domain doesn't work and you fall back to the workers.dev URL.

## 13. Time budget

| Phase | Active time | Wait time |
|---|---|---|
| Domain registration + ID verification (step 1-2) | 10-30 min | 0-2h registry processing |
| CF zone add + NS swap (step 3) | 5 min | 1-12h propagation (occasionally 48h) |
| DNS records + Resend verify (steps 4-5) | 30 min | 5-30 min Resend lookups |
| Worker custom domain (step 6) | 5 min | 1-5 min cert provision |
| URL flip + deploy (step 7) | 5 min | 1 min deploy |
| Synthetic + smoke verify (steps 9-10) | 10 min | up to 15 min for next cron tick |
| **Total** | **~1h active** | **~1-2 days clock time** |

The bulk of clock time is passive waiting for nameserver propagation between steps 3 and 4. Once NS is `Active` in Cloudflare, the rest takes ~1h end-to-end.

## Known limitations

- **Registry propagation.** Some registrars take a few hours to push the registration to the `.uk` registry. The domain may show as "Active" in your registrar account but `dig` returns NXDOMAIN briefly. Just wait.
- **Resend can take longer for first-ever verification.** First domain on a new Resend account sometimes takes 2-4h instead of <30min for full DKIM/DMARC propagation. Subsequent domains are fast.
- **CF cert provisioning isn't instant.** The custom domain returns 525/526 for the first 1-5 min before the universal SSL cert is issued. Don't panic; wait.
