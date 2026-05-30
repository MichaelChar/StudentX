import { NextResponse } from 'next/server';
import { getResend } from '@/lib/resend';
import { normalizeMultiLine, codepointLength } from '@/lib/textNormalize';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';

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

// --- Best-effort per-IP rate limit ----------------------------------------
// Module-level Map keyed by client IP → array of recent report timestamps.
// This is BEST-EFFORT ONLY: Cloudflare Workers runs each request in an
// ephemeral isolate that can be recycled at any time and is not shared
// across colos, so this Map is neither global nor durable. It throttles the
// common "mash the button" / single-isolate flood case and nothing more.
// A hard guarantee would need a durable store (KV / Durable Object / DB).
const RATE_LIMIT_MAX = 3; // reports
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes per IP
const reportHits = new Map();

/**
 * Derive the client IP from the standard CF / proxy headers. Mirrors the
 * header precedence used elsewhere; cf-connecting-ip is the single trusted
 * client IP on Cloudflare, x-forwarded-for is the proxy chain (first hop is
 * the client). Falls back to 'unknown' so the limiter still buckets when no
 * header is present (e.g. local dev).
 */
function clientIp(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
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
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error_code: 'RATE_LIMITED', error: 'Too many reports. Please try again later.' },
      { status: 429 },
    );
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
      from: FROM_ADDRESS,
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
