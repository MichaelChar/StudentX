/*
  Global teardown — sweep any leftover `E2E ` fixture listings.

  WHY THIS IS NOT OPTIONAL. Fixtures used to be created `listing_status =
  'disabled'` (a landlord submit never publishes), so a leaked one was
  invisible: it sat in the table and nobody saw it. Once createFixtureListing
  started promoting fixtures to `active` — which it must, or bookingService
  rejects them with LISTING_DISABLED and journeys 2-5 cannot run at all — a
  leaked fixture became a listing ON THE PUBLIC SITE.

  That is not hypothetical. The run on 2026-09-10 left SEVEN fixtures live on
  studentx.uk, mixed in with the three real listings, because per-test
  afterEach cleanup does not run when a test crashes or times out mid-way.
  They were removed by hand. This makes that impossible to repeat.

  DELIBERATELY SELF-CONTAINED. It imports nothing from e2e/fixtures/env.mjs
  or e2e/helpers/api.mjs. A module imported by config/globalSetup/
  globalTeardown that the SPECS also import gets cached as CommonJS before
  Playwright installs its spec transpiler, and every spec then dies with
  "SyntaxError: Unexpected token 'export'" — see the header of
  credentialCheck.mjs, which was written after exactly that.

  The title prefix is the guard, matching FIXTURE_TITLE_PREFIX. Nobody titles
  a real listing "E2E ", which is why the suite uses a prefix rather than an
  id allowlist that goes stale.
*/
import { createClient } from '@supabase/supabase-js';

const FIXTURE_TITLE_PREFIX = 'E2E ';

export default async function globalTeardown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // No service key means the booking journeys skipped anyway — nothing to sweep.
  if (!url || !key) return;

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: strays, error } = await supabase
    .from('listings')
    .select('listing_id, title, listing_status')
    .like('title', `${FIXTURE_TITLE_PREFIX}%`);

  if (error) {
    console.warn('[e2e teardown] could not list fixtures:', error.message);
    return;
  }
  if (!strays || strays.length === 0) return;

  const ids = strays.map((r) => r.listing_id);
  console.warn(
    `[e2e teardown] sweeping ${ids.length} leftover fixture listing(s): ${ids.join(', ')}\n` +
      '  (per-test cleanup did not run — most likely a test crashed or timed out)',
  );

  // Children first. Each delete is scoped to the fixture ids, never a bare
  // truthy filter, so a bug here cannot reach a real listing.
  for (const table of [
    'bookings',
    'inquiries',
    'listing_availability_blocks',
    'listing_amenities',
    'faculty_distances',
    'listing_university_distances',
    'listing_views',
  ]) {
    const { error: childErr } = await supabase.from(table).delete().in('listing_id', ids);
    if (childErr) console.warn(`[e2e teardown] ${table}: ${childErr.message}`);
  }

  const { error: delErr } = await supabase.from('listings').delete().in('listing_id', ids);
  if (delErr) console.warn('[e2e teardown] listings:', delErr.message);
}
