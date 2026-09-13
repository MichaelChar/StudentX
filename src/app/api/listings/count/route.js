import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Lightweight count endpoint for the landing-page stat tile. The full
// `/api/listings` GET runs a 6-relation JOIN and returns ~80 KB of JSON;
// the homepage was calling it just to read `data.listings.length`. This
// endpoint uses Supabase's `head: true` modifier so Postgres returns
// only a count, no rows. Cache headers mirror PUBLIC_CACHE_HEADERS in
// next.config.mjs so Cloudflare's edge serves repeat hits.
//
// `listing_status = 'active'` is REQUIRED, not an optimisation. The tile
// reads "N places available" and its caller's own comment says "live count
// of active listings" — but this query had no status clause, so it counted
// drafts, submitted-awaiting-review and landlord-paused rows as available
// housing. `listing_status` defaults to `disabled` (migration 104) and only
// /api/admin/listing-go-live sets `active`, so the unfiltered count is the
// count of rows that EXIST, which is not a number any visitor wants.
// Invisible today only because every listing in prod happens to be active;
// it inflates the moment a landlord saves a draft. Matches the clause every
// other public listing read already applies (listingSearch, priceDistribution,
// count-filtered, /api/listings/[id]).
export async function GET() {
  try {
    const { count, error } = await getSupabase()
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("listing_status", "active");

    if (error) {
      console.error("Listings count query failed:", error);
      return NextResponse.json({ error: "Failed to fetch count" }, { status: 500 });
    }

    const response = NextResponse.json({ count: count ?? 0 });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=86400"
    );
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/count:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
