import { NextResponse } from 'next/server';

// Lightweight client-error beacon for auth flows (#143). The login/sign-out
// paths swallow errors so a hung signOut or a failed cookie-sync never blocks
// the UI — but that also made them invisible (the "stuck on SIGNING IN…" bug
// was only found via a user report). Clients POST a tiny payload here; it's
// logged so failures surface in `wrangler tail` / Worker logs.
//
// Always returns 204 — a beacon must never surface its own error to the user,
// including when it is the one dropping the event. Fields are clamped; nothing
// here is trusted or echoed back.
//
// Rate-limited per IP per isolate (#252C). Best-effort by construction: each
// Cloudflare colo runs its own recycling isolate, so the Map is neither global
// nor durable and a determined flood across colos still gets through. It caps
// the cheap case — one client looping — which is the realistic abuse of a
// public unauthenticated endpoint. A Durable Object is the real fix if volume
// ever justifies it.

const ALLOWED_CONTEXTS = new Set([
  'signOut',
  'login-session-sync',
  'login',
  'signup',
  // Per-stage login timing beacon (#265). Payload is a JSON stage map of
  // millisecond durations; logged here so it surfaces in `wrangler tail`.
  'login-timing',
]);
const MAX_MESSAGE = 500;
const MAX_DETAIL = 200;

function clamp(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// Per-isolate token bucket, mirroring /api/listings/report's shape.
const BEACON_MAX = 20; // events
const BEACON_WINDOW_MS = 60 * 1000; // per minute per IP

const beaconHits = new Map();

function overBeaconBudget(ip) {
  const now = Date.now();
  const cutoff = now - BEACON_WINDOW_MS;
  const recent = (beaconHits.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= BEACON_MAX) {
    beaconHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  beaconHits.set(ip, recent);
  return false;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  /*
    `cf-connecting-ip` only — the same reasoning as the report route: the
    alternatives are client-settable, so honouring them would let one client
    rotate a header and never hit the cap. Off Cloudflare everything shares the
    'unknown' bucket, which fails toward limiting rather than away from it.
  */
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (overBeaconBudget(ip)) {
    // Silently dropped: still 204, because the contract above says a beacon
    // never reports its own failure.
    return new NextResponse(null, { status: 204 });
  }

  const context = ALLOWED_CONTEXTS.has(body?.context) ? body.context : 'unknown';
  const message = clamp(body?.message, MAX_MESSAGE);
  const detail = clamp(body?.detail, MAX_DETAIL);

  // JSON.stringify the strings so newlines / control chars can't forge extra
  // log lines.
  console.error(
    `[client-error] context=${context} message=${JSON.stringify(message)} detail=${JSON.stringify(detail)}`,
  );

  return new NextResponse(null, { status: 204 });
}
