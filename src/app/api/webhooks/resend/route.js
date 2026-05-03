import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Resend (via Svix) signs every webhook. We verify the signature before
// trusting the payload, otherwise anyone who learns this URL could insert
// arbitrary suppressions and DoS our email delivery.
//
// Headers Svix sends:
//   svix-id         — unique message id (msg_xxx)
//   svix-timestamp  — unix seconds, used in the signed payload + replay window
//   svix-signature  — space-separated list like "v1,sig1 v1,sig2"
//                     (multiple sigs supported during secret rotation)
//
// The webhook secret format is `whsec_<base64>`. We base64-decode the part
// after the prefix, then HMAC-SHA256 of `{svix-id}.{svix-timestamp}.{rawBody}`
// with that key, then base64-encode the result and compare to one of the
// v1 signatures.

const REPLAY_TOLERANCE_SECONDS = 5 * 60;

async function verifySvixSignature({ rawBody, headers, secret }) {
  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'missing svix headers' };
  }

  // Replay protection. Svix's recommendation is 5 min.
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'malformed svix-timestamp' };
  }
  const drift = Math.abs(Date.now() / 1000 - ts);
  if (drift > REPLAY_TOLERANCE_SECONDS) {
    return { ok: false, reason: `timestamp drift ${Math.round(drift)}s exceeds tolerance` };
  }

  // The secret arrives prefixed with `whsec_`; the portion after is the
  // base64-encoded HMAC key.
  const keyB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedPayload));
  // base64-encode without using Buffer (not available on Workers runtime)
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // svix-signature is "v1,xxx v1,yyy" — at least one v1 sig must match.
  const provided = svixSignature.split(' ').filter((s) => s.startsWith('v1,'));
  for (const p of provided) {
    if (p.slice('v1,'.length) === sigB64) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'no v1 signature matched' };
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Don't return 200 — we want Resend to retry once the secret is set.
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured; rejecting');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  // Read body once as text so signature verification and JSON parsing both
  // see the exact same byte sequence.
  const rawBody = await request.text();

  const verification = await verifySvixSignature({
    rawBody,
    headers: request.headers,
    secret,
  });
  if (!verification.ok) {
    console.warn(`[resend-webhook] signature verification failed: ${verification.reason}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Resend payload shape (https://resend.com/docs/dashboard/webhooks/event-types):
  //   { type: 'email.bounced' | 'email.complained' | ... ,
  //     created_at, data: { email_id, to: [], from, subject, ... bounce: { ... } } }
  const type = event?.type;
  const data = event?.data || {};
  const recipients = Array.isArray(data.to) ? data.to : [];
  const eventId = data.email_id || event?.id || null;

  if (type !== 'email.bounced' && type !== 'email.complained') {
    // Acknowledge silently — Resend may send delivered/opened/clicked events
    // we don't act on. Returning 200 prevents retries.
    return NextResponse.json({ ok: true, ignored: type || 'unknown' });
  }

  if (recipients.length === 0) {
    console.warn(`[resend-webhook] ${type} arrived with no recipients`);
    return NextResponse.json({ ok: true, suppressed: 0 });
  }

  const reason = type === 'email.bounced' ? 'bounced' : 'complained';
  const bounceType = type === 'email.bounced' ? data?.bounce?.type || null : null;

  const rows = recipients.map((email) => ({
    email: String(email).trim().toLowerCase(),
    reason,
    bounce_type: bounceType,
    source_event_id: eventId,
  }));

  const supabase = getServiceSupabase();
  // upsert on email PK so a duplicate webhook delivery doesn't error.
  // We don't update existing rows — the FIRST suppression reason wins
  // (a bounced address that later complains stays "bounced", which is
  // the more actionable signal for triage).
  const { error } = await supabase
    .from('email_suppressions')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: true });

  if (error) {
    console.error('[resend-webhook] suppression upsert failed:', error.message);
    return NextResponse.json({ error: 'DB write failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, suppressed: rows.length, type });
}
