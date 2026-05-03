import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Lightweight count endpoint for the landing-page stat tile. The full
// `/api/listings` GET runs a 6-relation JOIN and returns ~80 KB of JSON;
// the homepage was calling it just to read `data.listings.length`. This
// endpoint uses Supabase's `head: true` modifier so Postgres returns
// only a count, no rows. Cache headers mirror PUBLIC_CACHE_HEADERS in
// next.config.mjs so Cloudflare's edge serves repeat hits.
export async function GET() {
  try {
    const { count, error } = await getSupabase()
      .from("listings")
      .select("*", { count: "exact", head: true });

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
