import { responseTimeBucket } from '@/lib/responseTimeBucket';

/*
  Listing highlights — parity Feature 29.

  Airbnb's icon + bold-line + grey-line stack under the host row. Three rows,
  in a FIXED order, with no conditional ranking and no substitution: rows 2 and
  3 simply do not render when their condition is false and the section shrinks.
  Nothing is ever promoted to fill a gap.

    1. Commute      — always (see the caveat below)
    2. Bills included — when rent.bills_included
    3. Response time  — within_hour / within_day ONLY

  WHY ROW 3 IGNORES A BUCKET THE BUCKETER RETURNS. responseTimeBucket also
  returns 'within_2_days', and the spec deliberately does not surface it: "we
  usually reply within two days" is not a highlight, it is an apology. The
  bucketer stays general because other callers may want it; the gating lives
  here.

  WHY THIS RETURNS KEYS, NOT COPY. The renderer (ListingHighlights) is
  presentational and takes finished strings. Translation happens in the page,
  which is a server component with getTranslations. Returning {key, params}
  keeps this function pure and testable without a next-intl provider, and keeps
  the component free of a translation hook.
*/

/** Row 1's caveat: a listing with no computed distances cannot claim one. */
function commuteRow(listing, selectedFacultyId) {
  const candidates = (listing?.faculty_distances ?? [])
    .filter((fd) => typeof fd.walk_minutes === 'number' && fd.walk_minutes >= 0)
    .slice()
    .sort((a, b) => a.walk_minutes - b.walk_minutes);

  if (candidates.length === 0) return null;

  /*
    The refinement from the spec: if the student arrived with a faculty
    selected — from the commute filter (S15) or the quiz — show THEIR faculty,
    not the nearest one. A student who filtered on Health Sciences does not
    care that the Library happens to be closer.

    Falls back to nearest when the selected faculty has no row for this
    listing, rather than rendering nothing.
  */
  const chosen =
    (selectedFacultyId
      && candidates.find((c) => c.faculty_id === selectedFacultyId))
    || candidates[0];

  // Second-nearest EXCLUDING whichever we just showed — otherwise a student
  // with a selected faculty could see the same faculty twice.
  const runnerUp = candidates.find((c) => c.faculty_id !== chosen.faculty_id) ?? null;

  return {
    icon: 'walk',
    title: {
      key: 'highlightCommuteTitle',
      params: { minutes: chosen.walk_minutes, faculty: chosen.faculty_name },
    },
    subtitle: runnerUp
      ? {
          key: 'highlightCommuteSubtitle',
          params: {
            minutes: runnerUp.walk_minutes,
            faculty: runnerUp.faculty_name,
          },
        }
      : null,
  };
}

/*
  The spec asks this subtitle to "name what is covered". IT CANNOT, TRUTHFULLY.

  `rent.bills_included` is a bare boolean — there is no column, amenity or
  other field recording WHICH bills. Writing "water, electricity and internet"
  would be inventing a term of a real tenancy agreement that a student may rely
  on financially, which is not a copy decision anyone gets to make from the
  presentation layer.

  So the subtitle stays honest and general. Enumerating coverage needs a schema
  change (something like `rent.bills_covered text[]`) plus landlord input at
  listing time — deliberately out of scope here, and flagged rather than faked.
*/
function billsRow(listing) {
  if (!listing?.bills_included) return null;
  return {
    icon: 'euro',
    title: { key: 'highlightBillsTitle', params: {} },
    subtitle: { key: 'highlightBillsSubtitle', params: {} },
  };
}

const RESPONSE_ROW_BY_BUCKET = {
  within_hour: {
    title: 'highlightResponseHourTitle',
    subtitle: 'highlightResponseHourSubtitle',
  },
  within_day: {
    title: 'highlightResponseDayTitle',
    subtitle: 'highlightResponseDaySubtitle',
  },
};

function responseRow(listing, now) {
  const bucket = responseTimeBucket(
    listing?.avg_response_ms,
    listing?.response_stats_at,
    now,
  );
  const row = bucket ? RESPONSE_ROW_BY_BUCKET[bucket] : null;
  // within_2_days (and null) fall through to nothing — see the header comment.
  if (!row) return null;

  return {
    icon: 'message',
    title: { key: row.title, params: {} },
    subtitle: { key: row.subtitle, params: {} },
  };
}

/**
 * Build the ordered highlight rows for a listing.
 *
 * @param {object} listing  a transformListing() result
 * @param {object} [opts]
 * @param {string|null} [opts.selectedFacultyId]  faculty the student arrived with
 * @param {number|Date} [opts.now]  injectable clock for the staleness check
 * @returns {Array<{icon: string, title: {key: string, params: object}, subtitle: {key: string, params: object}|null}>}
 *   Ordered, 0–3 entries. Order is fixed; callers must not re-sort.
 */
export function deriveListingHighlights(listing, opts = {}) {
  const { selectedFacultyId = null, now = Date.now() } = opts;
  return [
    commuteRow(listing, selectedFacultyId),
    billsRow(listing),
    responseRow(listing, now),
  ].filter(Boolean);
}
