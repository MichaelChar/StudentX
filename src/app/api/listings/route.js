import { NextResponse } from "next/server";
import { searchListings } from "@/lib/listingSearch";

/*
  Public listing search.

  The query itself lives in `lib/listingSearch.js` (issue #443) because it has
  a second caller: the results page's server component renders the first page
  of listings into the HTML, and going through this route over HTTP to do that
  would be a Worker calling itself. This file owns only the HTTP contract —
  status codes and cache headers.
*/
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const { status, body } = await searchListings(searchParams);

    const response = NextResponse.json(body, { status });
    /*
      No edge cache on a degraded answer. `degraded` means the fallback SELECT
      could not honour `verified_only`, so the search failed CLOSED and
      returned an empty list — correct for one request, and wrong to hold at
      the edge for five minutes after the schema catches up.

      Before the extraction this path happened to escape the header by being a
      separate early return. That was luck, not intent; this states it.
    */
    if (status === 200 && !body?.degraded) {
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=600"
      );
    }
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/listings:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
