/**
 * The three numbers the host nav carries — parity Feature 49 addendum.
 *
 * The addendum deleted the dashboard's six-tile metric grid and re-homed the
 * survivors to places where they prompt an action instead of reporting a
 * score. Three of them land in the navigation itself:
 *
 *   PENDING REQUESTS  ─┬─→ a dot on the `Messages` tab
 *   PENDING INQUIRIES ─┘   (presence only — see `hasWaiting` below)
 *   VIEWS THIS MONTH  ───→ the top-right corner of the host nav
 *
 * They live together in one module and one round-trip because the nav renders
 * on EVERY landlord page. Three separate fetches per page-view, for a dot and
 * a number, is not a trade worth making.
 *
 * ON THE WINDOW. The view count is a rolling 30 days, not a calendar month —
 * that is what `/api/landlord/analytics` and the tile it replaces have always
 * measured. The label says "last 30 days" rather than inheriting the old
 * tile's "Views this month", which was simply wrong about its own query.
 */

/** Rolling window for the view count, in days. */
export const VIEWS_WINDOW_DAYS = 30;

/**
 * First day included in the view window, as a `YYYY-MM-DD` string.
 *
 * `listing_views.view_date` is a DATE column, so the cutoff is compared as a
 * date and not an instant. Pure — takes `now` so tests do not depend on today.
 *
 * @param {number|Date} [now=Date.now()]
 * @returns {string}
 */
export function viewsCutoffDate(now = Date.now()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - VIEWS_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Reduce raw rows into the nav's summary. Pure — exported for unit testing.
 *
 * WHY BOOLEANS AND NOT COUNTS for the two pending figures: the dot is
 * presence, not a tally. A landlord who is racing another landlord to reply
 * needs to know something is waiting; a number invites them to triage the
 * queue before opening it, which is the opposite of the behaviour the whole
 * feature exists to produce. The counts are deliberately discarded here so no
 * later caller can render one by accident.
 *
 * @param {{
 *   viewRows?: Array<{ view_count?: number|null }>|null,
 *   requestedBookingRows?: Array<unknown>|null,
 *   pendingInquiryRows?: Array<unknown>|null,
 * }} rows
 * @returns {{ viewsLast30: number, hasPendingRequests: boolean, hasPendingInquiries: boolean }}
 */
export function summariseHostNav({
  viewRows,
  requestedBookingRows,
  pendingInquiryRows,
} = {}) {
  const viewsLast30 = (viewRows || []).reduce((sum, row) => {
    const n = row?.view_count;
    return Number.isFinite(n) && n > 0 ? sum + n : sum;
  }, 0);

  return {
    viewsLast30,
    hasPendingRequests: (requestedBookingRows || []).length > 0,
    hasPendingInquiries: (pendingInquiryRows || []).length > 0,
  };
}

/**
 * Does the `Messages` tab get its dot?
 *
 * Both feeds land on the same tab, so either one alone is enough. Kept as a
 * named helper rather than an inline `||` at the call site, because the two
 * sources are genuinely different things (a booking request and an inquiry)
 * and the decision to merge them is the addendum's, not the renderer's.
 *
 * @param {{ hasPendingRequests?: boolean, hasPendingInquiries?: boolean }} summary
 * @returns {boolean}
 */
export function hasWaiting(summary) {
  return Boolean(summary?.hasPendingRequests || summary?.hasPendingInquiries);
}

/**
 * Fetch + reduce. Every scoping decision is RLS's, not ours.
 *
 * NO LANDLORD LOOKUP, AND NO SERVICE-ROLE CLIENT. All three tables carry a
 * landlord-scoped SELECT policy that resolves the landlord from `auth.uid()`
 * itself:
 *
 *   bookings       "Landlords read own listing bookings"
 *   inquiries      "Landlords can read their own listing inquiries"
 *   listing_views  "Landlords can read own listing views"
 *
 * so a token-scoped client already sees exactly this landlord's rows and
 * nothing else. The sibling landlord routes resolve `landlord_id` first
 * because they need it to filter `listings` — which is world-readable
 * ("Public can read listings", qual `true`) and therefore scopes nothing. We
 * never touch `listings`, so we never need the id, and dropping that step
 * takes the service-role key out of the path for chrome that renders on every
 * landlord page.
 *
 * A student calling this sees their OWN pending inquiries and bookings, via
 * the student-side policies on the same tables. That is their own data, and
 * they never render this nav — but it is why the result must not be treated
 * as proof the caller is a landlord.
 *
 * Returns a zeroed summary rather than throwing on any failure: this feeds
 * chrome wrapping every landlord page, and a dead nav is a far worse outcome
 * than a missing dot. Callers that need to know a query failed should not use
 * this function.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *        token-scoped client, so RLS limits rows to the caller.
 * @param {{ now?: number|Date }} [opts]
 * @returns {Promise<{ viewsLast30: number, hasPendingRequests: boolean, hasPendingInquiries: boolean }>}
 */
export async function getHostNavSummary(supabase, { now } = {}) {
  const cutoff = viewsCutoffDate(now);

  // `limit(1)` on both presence checks — we only ever ask "any?", so pulling
  // the whole queue back would be waste on every single page render.
  const [viewsRes, bookingsRes, inquiriesRes] = await Promise.all([
    supabase.from('listing_views').select('view_count').gte('view_date', cutoff),
    supabase.from('bookings').select('booking_id').eq('state', 'requested').limit(1),
    supabase.from('inquiries').select('inquiry_id').eq('status', 'pending').limit(1),
  ]);

  return summariseHostNav({
    viewRows: viewsRes.error ? [] : viewsRes.data,
    requestedBookingRows: bookingsRes.error ? [] : bookingsRes.data,
    pendingInquiryRows: inquiriesRes.error ? [] : inquiriesRes.data,
  });
}

/**
 * The one thing blocking go-live, for the banner that follows the landlord
 * across tabs — parity Feature 50.
 *
 * Fetched here rather than on the Listings page because the banner appears on
 * Listings AND Messages, and this summary is the one request every landlord
 * page already makes. It is the only part that needs `listings`, which is
 * world-readable ("Public can read listings", qual `true`) and therefore
 * scopes nothing — so this is the one query in the module that must be
 * filtered by landlord_id explicitly.
 *
 * Selects the minimum: three listing columns plus the verification rows the
 * gate reads. The full landlord listing select carries photos, amenities and
 * distances, none of which a banner needs on every page load.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase token-scoped
 * @param {string} userId JWT-derived
 * @returns {Promise<{ listings: Array, isVerified: boolean }>}
 */
export async function getHostGoLiveInputs(supabase, userId) {
  const { data: landlord } = await supabase
    .from('landlords')
    .select('landlord_id, is_verified')
    .eq('auth_user_id', userId)
    .single();

  if (!landlord?.landlord_id) return { listings: [], isVerified: false };

  const { data, error } = await supabase
    .from('listings')
    .select(
      'listing_id, listing_status, flags, property_verifications ( status, verified_at )',
    )
    .eq('landlord_id', landlord.landlord_id)
    .order('listing_id', { ascending: false });

  return {
    listings: error ? [] : data || [],
    isVerified: landlord.is_verified === true,
  };
}
