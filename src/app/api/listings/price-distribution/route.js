import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * Lightweight price-distribution source for the results-page budget histogram.
 *
 * Returns ONLY the monthly rent of every listing — no budget filter, and none
 * of the heavy joins (`location`, `property_types`, `landlords`,
 * `listing_amenities`, `faculty_distances`) or per-listing payload the main
 * `/api/listings` route carries. The results page buckets these client-side so
 * a student sees the FULL market spread, including listings priced ABOVE their
 * current budget, and can judge whether nudging the slider up is worth it.
 *
 * Budget-independent on purpose: the distribution must not collapse to the
 * in-budget slice (that's just the result list they already see below). Other
 * active filters (neighborhood, type, …) are intentionally NOT applied in v1 —
 * keeping the response identical for every visitor makes it trivially cacheable
 * at the edge. (Per-filter distributions are a possible v2.)
 */
export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from("listings")
      .select("rent!inner ( monthly_price )");

    if (error) {
      console.error("price-distribution query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch price distribution" },
        { status: 500 }
      );
    }

    // `rent` is a to-one embed (object), but guard against a PostgREST array
    // shape just in case. Drop nulls / non-numbers so the client can bucket
    // cleanly.
    const prices = (data || [])
      .map((row) => {
        const rent = Array.isArray(row.rent) ? row.rent[0] : row.rent;
        return rent?.monthly_price;
      })
      .filter((p) => typeof p === "number" && Number.isFinite(p));

    const response = NextResponse.json({ prices });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/price-distribution:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
