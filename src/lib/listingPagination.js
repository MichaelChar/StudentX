/*
  Numbered pagination for the results grid — parity Feature 15.

  WHY THE SLICE HAPPENS IN JS, AFTER RANKING, AND NOT AS SQL LIMIT/OFFSET.

  This is the trap in this feature, and it is silent if you get it wrong.

  /api/listings does NOT order in SQL. It fetches, transforms, and then sorts
  in JS with `compareListingsByRank`, which ranks on `is_verified`, a derived
  `listingCompleteness(...)` score, and `avg_response_ms` — none of which is a
  plain column you can ORDER BY. (See src/lib/listingRank.js.)

  So a DB-level `.range(offset, offset + n)` would take an ARBITRARY 18 rows
  and only then rank them. Page 1 would not be the top-ranked 18; it would be
  18 unspecified listings, sorted. The grid would look plausible and be wrong,
  and no test that only counts rows would notice.

  Slicing after the sort keeps ranking correct. The cost is that the query
  still reads the whole filtered set — but the EGRESS, which is the cost that
  actually lands on a student's mobile data, drops to one page regardless of
  inventory. At ~6.0 KB/listing that is 0.11 MB per request instead of 0.59 MB
  at 100 listings and 1.76 MB at 300.

  Moving the ranking into SQL is the real fix if the read cost ever bites.
  That is a bigger change than this feature, and premature at 3 listings.
*/

/** Airbnb's live desktop results page: verified 18 per page, 2026-08-07. */
export const PER_PAGE = 18;

/**
 * Parse a `page` query param.
 *
 * Anything unparseable degrades to page 1 rather than erroring: this is a
 * browsing surface reached from shared links and crawlers, and a 400 on
 * `?page=abc` turns a junk URL into a dead end instead of a first page.
 *
 * @param {string|null|undefined} raw
 * @returns {number} a 1-based page number, >= 1
 */
export function parsePageParam(raw) {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

/**
 * Total pages for a result count. Always at least 1, so an empty result set
 * still renders as "page 1 of 1" rather than "page 1 of 0".
 *
 * @param {number} total
 * @param {number} [perPage]
 * @returns {number}
 */
export function totalPages(total, perPage = PER_PAGE) {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * Slice one page out of an ALREADY-RANKED list.
 *
 * Clamps past-the-end requests to the last page rather than returning an empty
 * grid: `?page=99` on a 2-page search is a stale link or a crawler guess, and
 * the useful answer is the last real page, not nothing.
 *
 * @param {Array} ranked  listings in final display order
 * @param {number} page   1-based
 * @param {number} [perPage]
 * @returns {{items: Array, page: number, perPage: number, total: number, totalPages: number}}
 */
export function paginate(ranked, page, perPage = PER_PAGE) {
  const list = Array.isArray(ranked) ? ranked : [];
  const total = list.length;
  const pages = totalPages(total, perPage);
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * perPage;
  return {
    items: list.slice(start, start + perPage),
    page: safePage,
    perPage,
    total,
    totalPages: pages,
  };
}

/**
 * The page numbers to render, with gaps marked as null.
 *
 * Airbnb renders `1 2 3 4 … 15`: a run from the current position plus the last
 * page, with an ellipsis between. Reproduced here rather than "show every
 * page", which stops fitting on mobile somewhere around page 8.
 *
 * Returns numbers and `null` separators — the caller decides how to draw a gap
 * (an ellipsis is presentational, and it must not be a click target).
 *
 * @param {number} current
 * @param {number} pages
 * @param {number} [window] how many neighbours to show either side
 * @returns {Array<number|null>}
 */
export function paginationItems(current, pages, window = 1) {
  if (pages <= 1) return [1];

  const page = Math.min(Math.max(1, current), pages);
  const shown = new Set([1, pages]);
  for (let i = page - window; i <= page + window; i += 1) {
    if (i >= 1 && i <= pages) shown.add(i);
  }

  // Airbnb keeps the first run dense — 1 2 3 4 … 15 — rather than 1 … 3 … 15,
  // so a student one page in can still reach page 4 in one click.
  if (page <= 3) {
    for (let i = 1; i <= Math.min(4, pages); i += 1) shown.add(i);
  }
  if (page >= pages - 2) {
    for (let i = Math.max(1, pages - 3); i <= pages; i += 1) shown.add(i);
  }

  const sorted = [...shown].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of sorted) {
    // Only insert a gap for a real skip. A single missing page renders as the
    // number itself — an ellipsis hiding exactly one page is worse than the
    // page.
    if (prev && n - prev === 2) out.push(prev + 1);
    else if (prev && n - prev > 2) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}
