import { NextResponse } from 'next/server';

// Lightweight client-error beacon for auth flows (#143). The login/sign-out
// paths swallow errors so a hung signOut or a failed cookie-sync never blocks
// the UI — but that also made them invisible (the "stuck on SIGNING IN…" bug
// was only found via a user report). Clients POST a tiny payload here; it's
// logged so failures surface in `wrangler tail` / Worker logs.
//
// Always returns 204 — a beacon must never surface its own error to the user.
// Fields are clamped; nothing here is trusted or echoed back. Not rate-limited
// yet (a public unauth endpoint) — acceptable for a low-volume beacon, but
// worth a Durable-Object counter if abuse shows up.

const ALLOWED_CONTEXTS = new Set([
  'signOut',
  'login-session-sync',
  'login',
  'signup',
]);
const MAX_MESSAGE = 500;
const MAX_DETAIL = 200;

function clamp(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
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
