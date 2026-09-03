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
 * Fetch + reduce, honouring RLS via the passed client.
 *
 * Returns a zeroed summary rather than throwing on any failure: this feeds
 * chrome that wraps every landlord page, and a dead nav is a far worse
 * outcome than a missing dot. Callers that need to know a query failed should
 * not use this function.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *        token-scoped client, so RLS limits rows to this landlord.
 * @param {string[]} listingIds  the landlord's listing ids.
 * @param {{ now?: number|Date }} [opts]
 * @returns {Promise<{ viewsLast30: number, hasPendingRequests: boolean, hasPendingInquiries: boolean }>}
 */
export async function getHostNavSummary(supabase, listingIds, { now } = {}) {
  const ids = (listingIds || []).filter(Boolean);
  if (ids.length === 0) return summariseHostNav();

  const cutoff = viewsCutoffDate(now);

  // `limit(1)` on both presence checks — we only ever ask "any?", so pulling
  // the whole queue back would be waste on every single page render.
  const [viewsRes, bookingsRes, inquiriesRes] = await Promise.all([
    supabase
      .from('listing_views')
      .select('view_count')
      .in('listing_id', ids)
      .gte('view_date', cutoff),
    supabase
      .from('bookings')
      .select('booking_id')
      .in('listing_id', ids)
      .eq('state', 'requested')
      .limit(1),
    supabase
      .from('inquiries')
      .select('inquiry_id')
      .in('listing_id', ids)
      .eq('status', 'pending')
      .limit(1),
  ]);

  return summariseHostNav({
    viewRows: viewsRes.error ? [] : viewsRes.data,
    requestedBookingRows: bookingsRes.error ? [] : bookingsRes.data,
    pendingInquiryRows: inquiriesRes.error ? [] : inquiriesRes.data,
  });
}
