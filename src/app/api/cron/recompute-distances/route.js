import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recomputeMissingDistances } from '@/lib/recomputeDistances';

// Daily cron at 09:15 UTC heals any `faculty_distances` rows that never got
// populated synchronously (OSRM hiccup during create/edit, or a backfill from
// before the inline path existed). The actual work lives in
// src/lib/recomputeDistances.js so the listing-create/edit routes can call
// the same function inline.
//
// Triggered by cf/worker-entry.mjs's CRON_ROUTES table.

// Service-role client: bypasses RLS so the cron can write faculty_distances
// without per-row policies. Mirrors the pattern in landlord-message-digest.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await recomputeMissingDistances({ supabase: getServiceSupabase() });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
