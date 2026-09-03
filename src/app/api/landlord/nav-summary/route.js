import { NextResponse } from 'next/server';
import {
  extractToken,
  getUserFromToken,
  getSupabaseWithToken,
} from '@/lib/supabaseServer';
import {
  getHostGoLiveInputs,
  getHostNavSummary,
  summariseHostNav,
} from '@/lib/hostNavSummary';
import { pickActionRequired } from '@/lib/hostActionRequired';

/*
  The host nav's three numbers — parity Feature 49 addendum.

  The nav renders on EVERY landlord page, so this exists to make that one
  round-trip instead of three (analytics + bookings + inquiries). It returns
  presence booleans, never counts: see the note in lib/hostNavSummary.js.

  NO SERVICE-ROLE CLIENT AND NO LANDLORD LOOKUP. Its sibling routes open with
  a service-role read of `landlords.auth_user_id` because they need
  `landlord_id` to filter `listings`. We never query `listings` — all three
  tables here carry landlord-scoped RLS policies keyed on `auth.uid()` — so
  that step would buy nothing and cost the one dependency that makes this
  route fail in an environment without the service key.

  IT NEVER 5xx's. This is chrome on every landlord page: a 500 here would put
  a red line in the console of every screen a landlord opens, to say a dot is
  missing. Failures degrade to a zeroed summary and are logged server-side.

  Deliberately not cached at the edge. It is per-caller and changes the moment
  a student sends anything; a stale dot is the failure mode the whole feature
  exists to avoid. It is also auth-touching, so OpenNext on Workers would
  force it private regardless (see CLAUDE.md).
*/

export async function GET(request) {
  const token = extractToken(request);
  // 401 is the one real status this route returns — an unauthenticated caller
  // is a bug at the call site, not a degraded nav.
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = getSupabaseWithToken(token);
    const user = await getUserFromToken(token);

    /*
      The go-live inputs need the caller's user id (to resolve landlord_id, the
      only filter `listings` responds to). Everything else is scoped by RLS, so
      the two halves run in parallel and a failure in either degrades alone.
    */
    const [summary, goLive] = await Promise.all([
      getHostNavSummary(supabase),
      user ? getHostGoLiveInputs(supabase, user.id) : { listings: [], isVerified: false },
    ]);

    return NextResponse.json({
      summary,
      // Feature 50's banner. Null when nothing is blocking — the shell renders
      // nothing rather than an empty container.
      actionRequired: pickActionRequired(goLive),
    });
  } catch (err) {
    console.error('nav-summary failed, serving zeroed summary:', err);
    return NextResponse.json({ summary: summariseHostNav(), actionRequired: null });
  }
}
