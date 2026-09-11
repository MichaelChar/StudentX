import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResend } from '@/lib/resend';
import { opsFromAddress } from '@/lib/emailFrom';
import { normalizeMultiLine, codepointLength } from '@/lib/textNormalize';

// Fixed reason set — must mirror the radio options in ReportListingModal.js
// and the `report.reason*` keys in en.json. Anything outside this set is a
// 400 (the modal can only emit these, so an off-list value means a tampered
// or stale client).
const ALLOWED_REASONS = new Set([
  'already_rented',
  'scam_fraud',
  'inaccurate_info',
  'inappropriate',
  'other',
]);

const MAX_NOTE_LEN = 1000;

// All listing ids are 7-digit (see star schema). Reject anything else before
// we spend a Resend send on it.
const LISTING_ID_RE = /^\d{7}$/;

// --- Rate limiting: two layers (#219) -------------------------------------
//
// LAYER 2, the authority, is Postgres — check_listing_report_rate_limit
// (migration 118). It is durable, global across isolates and colos, and
// serialises same-IP callers with an advisory lock so the check-then-act
// race cannot let two concurrent requests both pass.
//
// LAYER 1, kept below, is the original module-level Map. It is NOT a
// security control and never was: Cloudflare Workers runs each request in
// an ephemeral per-colo isolate, so the Map is neither global nor durable.
// It survives purely as a cheap short-circuit — a mashed button is caught
// in-process without spending a database round-trip. Everything that gets
// past it is decided by layer 2.
//
// Durable Objects and KV were the other options #219 lists. DOs are not on
// the Workers Free plan this project runs on (#153 is the open decision
// about upgrading), and a KV namespace means new bindings to keep in sync
// across wrangler.jsonc and the dashboard. Postgres was already reachable
// from here and gives transactional correctness for free.
const RATE_LIMIT_MAX = 3; // reports
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes per IP
const reportHits = new Map();

// Service client: the throttle table and its RPC are service_role-only, so
// no client-reachable role can burn someone's budget or hand itself a
// bigger one by passing p_max.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/*
  Hash the IP before it reaches the database. A rate limiter needs a stable
  bucket key, not the address itself, and an un-hashed column would make
  this table a standing log of every reporter's IP — for an endpoint whose
  entire point is that you do not need an account to use it.

  REPORT_IP_SALT is optional; without it the pepper below still prevents
  the column being a plain IP, though a determined holder of the table
  could brute-force the IPv4 space. Set it as a Worker secret to close
  that: `wrangler secret put REPORT_IP_SALT --name studentx`.
*/
async function hashIp(ip) {
  const salt = process.env.REPORT_IP_SALT || 'studentx-report-throttle-v1';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive the client IP from the standard CF / proxy headers. Mirrors the
 * header precedence used elsewhere; cf-connecting-ip is the single trusted
 * client IP on Cloudflare, x-forwarded-for is the proxy chain (first hop is
 * the client). Falls back to 'unknown' so the limiter still buckets when no
 * header is present (e.g. local dev).
 */
/*
  `cf-connecting-ip` ONLY in production (#252B).

  `x-forwarded-for` and `x-real-ip` are client-settable. Behind Cloudflare they
  are irrelevant because `cf-connecting-ip` is always present and is set by the
  edge — but the fallback meant that anywhere the CF header was missing, an
  attacker could rotate a spoofed XFF and reset the per-IP limit on every
  request, which is the same as having no limiter.

  Off Cloudflare the fallback is still useful (local dev), so it is kept there
  and only there. In production an absent CF header collapses to one shared
  'unknown' bucket: stricter than trusting the client, and it fails toward
  rate-limiting rather than away from it.

  The limiter remains best-effort and per-isolate by design — see the note
  above `RATE_LIMIT`. This removes the trivial spoof, not the architectural
  limit; #219 tracks making it durable.
*/
function clientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  if (process.env.NODE_ENV !== 'production') {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim();
  }
  return 'unknown';
}

/** @returns {boolean} true when this IP is over the window budget. */
function isRateLimited(ip) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (reportHits.get(ip) || []).filter((ts) => ts > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    reportHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  reportHits.set(ip, recent);
  return false;
}

const REASON_LABELS = {
  already_rented: 'Already rented / no longer available',
  scam_fraud: 'Scam or fraud',
  inaccurate_info: 'Inaccurate information',
  inappropriate: 'Inappropriate content',
  other: 'Other',
};

/**
 * Anonymous listing-report endpoint (email-only v1 — no table/migration).
 * A visitor flags a listing from the detail page; we email the ops inbox
 * (SYNTHETIC_ALERT_EMAIL) so a human can review and act. Validation is
 * strict (7-digit id, enum reason, capped note) and there's a best-effort
 * per-IP throttle. Email failures mirror inquiryEmail.js: logged, surfaced
 * to the caller as a 5xx.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const listingId = typeof body.listingId === 'string' ? body.listingId.trim() : '';
  if (!LISTING_ID_RE.test(listingId)) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'listingId must be a 7-digit id' },
      { status: 400 },
    );
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!ALLOWED_REASONS.has(reason)) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: 'reason is not one of the allowed values' },
      { status: 400 },
    );
  }

  // note is optional. Normalize, then hard-cap by codepoint length.
  let note = normalizeMultiLine(body.note) ?? '';
  if (codepointLength(note) > MAX_NOTE_LEN) {
    note = [...note].slice(0, MAX_NOTE_LEN).join('');
  }

  // Throttle after validation so malformed floods are cheap and a 400 never
  // burns a 429 slot.
  const ip = clientIp(request);

  // Layer 1 — in-process, cheap, not authoritative. See the note above.
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error_code: 'RATE_LIMITED', error: 'Too many reports. Please try again later.' },
      { status: 429 },
    );
  }

  // Layer 2 — durable and global. This is the actual limit.
  let verdict = 'ok';
  try {
    const { data, error } = await getServiceSupabase().rpc('check_listing_report_rate_limit', {
      p_ip_hash: await hashIp(ip),
      p_listing_id: listingId,
    });
    if (error) throw error;
    verdict = data ?? 'ok';
  } catch (err) {
    /*
      FAIL OPEN, deliberately. If Postgres is unreachable, the choice is
      between dropping a legitimate abuse report and allowing a flood
      during an outage. Layer 1 still caps the easy case, ops still get
      the email, and a silently-swallowed report is the worse outcome for
      an endpoint whose whole job is surfacing scams. Logged loudly so
      the failure is visible rather than inferred from a quiet inbox.
    */
    console.error('Listing report: durable rate-limit check failed, allowing through:', err);
  }

  if (verdict === 'rate_limited') {
    return NextResponse.json(
      { error_code: 'RATE_LIMITED', error: 'Too many reports. Please try again later.' },
      { status: 429 },
    );
  }

  if (verdict === 'duplicate') {
    /*
      Same IP, same listing, inside the dedupe window. Answer 200 without
      emailing: ops learn nothing from the second copy, and the reporter
      should not be told their earlier report "failed" — nor given a
      429 that reads as punishment for reporting a genuine problem twice.
    */
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const recipient = process.env.SYNTHETIC_ALERT_EMAIL;
  if (!recipient) {
    console.error('Listing report: no SYNTHETIC_ALERT_EMAIL configured; dropping report', {
      listingId,
      reason,
    });
    return NextResponse.json(
      { error_code: 'INTERNAL', error: 'Reporting is temporarily unavailable' },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
  const listingUrl = `${appUrl}/property/thessaloniki/listing/${listingId}`;
  const reasonLabel = REASON_LABELS[reason] || reason;

  const lines = [
    'A visitor reported a listing on StudentX.',
    '',
    `Listing ID: ${listingId}`,
    `Listing URL: ${listingUrl}`,
    `Reason: ${reasonLabel} (${reason})`,
    `Reporter IP: ${ip}`,
    '',
    'Note:',
    note || '(none)',
  ];

  try {
    await getResend().emails.send({
      from: opsFromAddress(),
      to: recipient,
      subject: `Listing report — ${listingId} — ${reasonLabel}`,
      text: lines.join('\n'),
    });
  } catch (err) {
    console.error('Failed to send listing-report email:', err);
    return NextResponse.json(
      { error_code: 'INTERNAL', error: 'Failed to submit report' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
