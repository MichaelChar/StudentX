import { setRequestLocale } from 'next-intl/server';

import { searchListings } from '@/lib/listingSearch';
import { parseBoundsParams, boundsToParams } from '@/lib/mapBounds';
import { todayYmd } from '@/lib/dateRange';
import {
  buildListingsQuery,
  initialFiltersFromParams,
  initialPageFromParams,
} from '@/lib/resultsQuery';
import ResultsClient from './ResultsClient';

/*
  Results — a server component that renders the first page of listings into the
  HTML, wrapping the client page that owns filters, the map and everything
  interactive (issue #443).

  WHY. Results were fetched entirely client-side, so a crawler received an
  empty grid:

    $ curl -s https://studentx.uk/property/thessaloniki/results | grep -c "listing/0106"
    0

  Feature 15 chose numbered pagination over infinite scroll and gave "each page
  is a distinct crawlable URL with distinct content" as its first rationale.
  Pagination delivered the URLs; it could not deliver the content, because
  there was none in the HTML to begin with. The housing directory is the lead
  magnet and organic search is the acquisition channel, so this is the one page
  where it matters most.

  WHY THIS DOES NOT BRING BACK THE 1101s. Issue #443 flags Cloudflare's
  "cross-request I/O" error as the risk. That came from PRERENDERING, which
  #316 removed by making the whole `[locale]` tree force-dynamic — and
  re-enabling it still needs OpenNext's R2 incremental cache wired first. This
  is not prerendering: it is a dynamic server component fetching per request,
  exactly what `listing/[id]/page.js` already does on every listing view. Same
  pattern, same runtime, already in production.

  THE QUERY MUST MATCH WHAT THE CLIENT WOULD BUILD. Both sides go through
  `lib/resultsQuery.js` and the string is handed to the client as
  `initialQuery`, which compares it against its own before deciding whether to
  fetch. If they ever disagree the client simply fetches, and the worst case is
  the behaviour this page had before.

  `todayYmd()` is read HERE and passed down, rather than read on both sides:
  the flexibility chips widen the date window relative to today, and a server
  and a browser reading the clock either side of midnight would build two
  different windows and refetch for nothing.
*/
export default async function ResultsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = (await searchParams) || {};
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      // Repeated params (`?types=a&types=b`) reach a server component as an
      // array. The client reads them through useSearchParams().get(), which
      // returns the FIRST — so take the first here too rather than inventing a
      // join the client would never produce.
      if (value.length > 0) urlParams.set(key, value[0]);
    } else if (value != null) {
      urlParams.set(key, value);
    }
  }

  const filters = initialFiltersFromParams(urlParams);
  const bounds = parseBoundsParams(urlParams).bounds ?? null;
  const page = initialPageFromParams(urlParams);
  const query = buildListingsQuery({
    filters,
    bounds,
    page,
    today: todayYmd(),
    boundsToParams,
  });

  /*
    A failed search is NOT fatal here. The client refetches whenever its query
    differs from `initialQuery`, so passing null initial data simply restores
    the old client-only behaviour — a brief skeleton, then results — instead of
    turning a transient Supabase hiccup into a 500 on a browsing page.
  */
  let initialData = null;
  try {
    const { status, body } = await searchListings(query);
    if (status === 200) initialData = body;
    else console.warn('results SSR search returned', status, body?.error);
  } catch (err) {
    console.error('results SSR search failed:', err?.message || err);
  }

  return (
    <ResultsClient
      initialData={initialData}
      initialQuery={initialData ? query.toString() : null}
    />
  );
}
